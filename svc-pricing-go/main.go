package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"sort"
	"strings"
	"time"

	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"

	openai "github.com/openai/openai-go/v3"
	"github.com/openai/openai-go/v3/option"
	"github.com/openai/openai-go/v3/responses"
)

type HoldingSnapshot struct {
	Symbol        string         `json:"symbol"`
	LatestDate    string         `json:"latestDate"`
	SavedClose    float64        `json:"savedClose"`
	LatestClose   float64        `json:"latestClose"`
	DayChangePct  float64        `json:"dayChangePct"`
	SinceSavedPct float64        `json:"sinceSavedPct"`
	SMA20         float64        `json:"sma20"`
	SMA50         float64        `json:"sma50"`
	Trend20       string         `json:"trend20"`
	Trend50       string         `json:"trend50"`
	SavedSignals  map[string]any `json:"savedSignals,omitempty"`
}

type PortfolioAnalysisResponse struct {
	GeneratedAt string            `json:"generatedAt"`
	Holdings    []HoldingSnapshot `json:"holdings"`
	Analysis    string            `json:"analysis"`
	Warnings    []string          `json:"warnings,omitempty"`
}

type Bar struct {
	T time.Time `json:"t"`
	O float64   `json:"o"`
	H float64   `json:"h"`
	L float64   `json:"l"`
	C float64   `json:"c"`
	V float64   `json:"v"`
}

type cacheEntry struct {
	data      []Bar
	expiresAt time.Time
}

var cache = map[string]cacheEntry{}

type SavedStockDoc struct {
	Symbol    string         `json:"symbol" bson:"symbol"`
	Data      []PricePoint   `json:"data" bson:"data"`
	Signals   map[string]any `json:"signals" bson:"signals"`
	CreatedAt time.Time      `json:"createdAt,omitempty" bson:"createdAt,omitempty"`
	UpdatedAt time.Time      `json:"updatedAt,omitempty" bson:"updatedAt,omitempty"`
}

func fetchSavedStocksTyped() ([]SavedStockDoc, error) {
	uri := os.Getenv("MONGODB_URI")
	if uri == "" {
		return nil, fmt.Errorf("MONGODB_URI is not set")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	client, err := mongo.Connect(options.Client().ApplyURI(uri))
	if err != nil {
		return nil, err
	}
	defer client.Disconnect(ctx)

	coll := client.Database("SavedStocks").Collection("SavedStocks")

	cur, err := coll.Find(ctx, bson.D{})
	if err != nil {
		return nil, err
	}
	defer cur.Close(ctx)

	var results []SavedStockDoc
	if err := cur.All(ctx, &results); err != nil {
		return nil, err
	}

	return results, nil
}

func fetchSeriesForSymbol(symbol, apiKey string) ([]Bar, error) {
	if symbol == "" {
		return nil, fmt.Errorf("missing symbol")
	}

	symbol = strings.ToUpper(strings.TrimSpace(symbol))

	if ce, ok := cache[symbol]; ok && time.Now().Before(ce.expiresAt) {
		return ce.data, nil
	}

	url := fmt.Sprintf(
		"https://www.alphavantage.co/query?function=TIME_SERIES_DAILY&symbol=%s&apikey=%s",
		symbol, apiKey,
	)

	resp, err := http.Get(url)
	if err != nil {
		return nil, fmt.Errorf("provider error: %w", err)
	}
	defer resp.Body.Close()

	var raw map[string]any
	if err := json.NewDecoder(resp.Body).Decode(&raw); err != nil {
		return nil, fmt.Errorf("decode error: %w", err)
	}

	ts, ok := raw["Time Series (Daily)"].(map[string]any)
	if !ok {
		return nil, fmt.Errorf("no time series returned (possibly rate limited)")
	}

	bars := make([]Bar, 0, len(ts))
	for day, v := range ts {
		row, _ := v.(map[string]any)
		t, _ := time.Parse("2006-01-02", day)

		bars = append(bars, Bar{
			T: t,
			O: atof(row["1. open"]),
			H: atof(row["2. high"]),
			L: atof(row["3. low"]),
			C: atof(row["4. close"]),
			V: atof(row["5. volume"]),
		})
	}

	sort.Slice(bars, func(i, j int) bool { return bars[i].T.Before(bars[j].T) })

	cache[symbol] = cacheEntry{
		data:      bars,
		expiresAt: time.Now().Add(60 * time.Second),
	}

	return bars, nil
}

func main() {
	apiKey := os.Getenv("ALPHAVANTAGE_API_KEY")
	if apiKey == "" {
		log.Fatal("ALPHAVANTAGE_API_KEY not set")
	}

	mux := http.NewServeMux()
	mux.HandleFunc("/healthz", func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(204) })

	// GET /series?symbol=AAPL
	mux.HandleFunc("/series", func(w http.ResponseWriter, r *http.Request) {
		enableCORS(w, r)
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}

		symbol := r.URL.Query().Get("symbol")
		if symbol == "" {
			http.Error(w, "missing ?id=XYZ", http.StatusBadRequest)
			return
		}

		bars, err := fetchSeriesForSymbol(symbol, apiKey)
		if err != nil {
			http.Error(w, err.Error(), http.StatusBadGateway)
			return
		}

		respondJSON(w, bars)
	})

	mux.HandleFunc("/getSavedStocks", func(w http.ResponseWriter, r *http.Request) {
		mongBars, err := fetchAllFromMongo()
		if err != nil {
			http.Error(w, "mongo error", http.StatusBadGateway)
			return
		}
		respondJSON(w, mongBars)
	})

	mux.HandleFunc("/postSavedStocks", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}

		defer r.Body.Close()

		var stock SavedStock
		decoder := json.NewDecoder(r.Body)
		decoder.DisallowUnknownFields()

		if err := decoder.Decode(&stock); err != nil {
			http.Error(w, "invalid request body: "+err.Error(), http.StatusBadRequest)
			return
		}

		matchedCount, modifiedCount, inserted, err := upsertSavedStock(stock)
		if err != nil {
			http.Error(w, "failed to save stock: "+err.Error(), http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]any{
			"matchedCount":  matchedCount,
			"modifiedCount": modifiedCount,
			"inserted":      inserted,
		})
	})

	mux.HandleFunc("/deleteSavedStocks", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodDelete {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}

		defer r.Body.Close()

		symbol := r.URL.Query().Get("id")
		if symbol == "" {
			http.Error(w, "missing ?symbol=XYZ", http.StatusBadRequest)
			return
		}

		_, err := deleteSavedStock(symbol)
		if err != nil {
			http.Error(w, "failed to delete stock: "+err.Error(), http.StatusInternalServerError)
			return
		}

		w.WriteHeader(http.StatusNoContent)
	})

	mux.HandleFunc("/portfolioAnalysis", func(w http.ResponseWriter, r *http.Request) {
		enableCORS(w, r)
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		if r.Method != http.MethodGet {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}

		savedStocks, err := fetchSavedStocksTyped()
		if err != nil {
			http.Error(w, "failed to load saved stocks: "+err.Error(), http.StatusBadGateway)
			return
		}

		if len(savedStocks) == 0 {
			respondJSON(w, PortfolioAnalysisResponse{
				GeneratedAt: time.Now().UTC().Format(time.RFC3339),
				Holdings:    []HoldingSnapshot{},
				Analysis:    "No saved holdings found.",
			})
			return
		}

		var holdings []HoldingSnapshot
		var warnings []string

		for _, stock := range savedStocks {
			bars, err := fetchSeriesForSymbol(stock.Symbol, apiKey)
			if err != nil {
				warnings = append(warnings, fmt.Sprintf("%s: %v", stock.Symbol, err))
				continue
			}

			if len(bars) < 2 {
				warnings = append(warnings, fmt.Sprintf("%s: not enough price history", stock.Symbol))
				continue
			}

			latest := bars[len(bars)-1]
			prev := bars[len(bars)-2]

			var savedClose float64
			if len(stock.Data) > 0 {
				savedClose = stock.Data[len(stock.Data)-1].Close
			}

			sma20 := smaFromBars(bars, 20)
			sma50 := smaFromBars(bars, 50)

			holding := HoldingSnapshot{
				Symbol:        strings.ToUpper(stock.Symbol),
				LatestDate:    latest.T.Format("2006-01-02"),
				SavedClose:    savedClose,
				LatestClose:   latest.C,
				DayChangePct:  pctChange(prev.C, latest.C),
				SinceSavedPct: pctChange(savedClose, latest.C),
				SMA20:         sma20,
				SMA50:         sma50,
				Trend20:       trendLabel(latest.C, sma20),
				Trend50:       trendLabel(latest.C, sma50),
				SavedSignals:  stock.Signals,
			}

			holdings = append(holdings, holding)
		}

		analysis := "Could not generate analysis."
		if len(holdings) > 0 {
			analysis, err = analyzePortfolioWithOpenAI(holdings)
			if err != nil {
				warnings = append(warnings, "OpenAI analysis failed: "+err.Error())
				analysis = "Portfolio snapshot generated, but AI commentary could not be created."
			}
		}

		respondJSON(w, PortfolioAnalysisResponse{
			GeneratedAt: time.Now().UTC().Format(time.RFC3339),
			Holdings:    holdings,
			Analysis:    analysis,
			Warnings:    warnings,
		})
	})

	log.Println("svc-pricing-go listening on :8080")
	log.Fatal(http.ListenAndServe(":8080", mux))
}

func atof(x any) float64 {
	switch v := x.(type) {
	case string:
		var f float64
		fmt.Sscan(v, &f)
		return f
	case float64:
		return v
	default:
		return 0
	}
}

func enableCORS(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
	w.Header().Set("Access-Control-Allow-Methods", "GET,POST,DELETE,OPTIONS")
}

func respondJSON(w http.ResponseWriter, v any) {
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(v)
}

func fetchAllFromMongo() ([]bson.M, error) {
	uri := os.Getenv("MONGODB_URI")
	if uri == "" {
		return nil, fmt.Errorf("MONGODB_URI is not set")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	client, err := mongo.Connect(options.Client().ApplyURI(uri))
	if err != nil {
		return nil, err
	}
	defer client.Disconnect(ctx)

	coll := client.Database("SavedStocks").Collection("SavedStocks")

	cur, err := coll.Find(ctx, bson.D{}) // empty filter = everything
	if err != nil {
		return nil, err
	}
	defer cur.Close(ctx)

	var results []bson.M
	if err := cur.All(ctx, &results); err != nil {
		return nil, err
	}

	return results, nil
}

type PricePoint struct {
	Date  string  `json:"date" bson:"date"`
	Close float64 `json:"close" bson:"close"`
}

type SavedStock struct {
	Symbol  string         `json:"symbol" bson:"symbol"`
	Data    []PricePoint   `json:"data" bson:"data"`
	Signals map[string]any `json:"signals" bson:"signals"`
}

func latestOnlySignals(signals map[string]any) map[string]any {
	out := make(map[string]any, len(signals))

	for key, val := range signals {
		switch v := val.(type) {
		case []any:
			if len(v) > 0 {
				out[key] = []any{v[len(v)-1]}
			} else {
				out[key] = []any{}
			}
		default:
			out[key] = v
		}
	}

	return out
}

func upsertSavedStock(stock SavedStock) (matchedCount int64, modifiedCount int64, inserted bool, err error) {
	uri := os.Getenv("MONGODB_URI")
	if uri == "" {
		return 0, 0, false, fmt.Errorf("MONGODB_URI is not set")
	}
	if stock.Symbol == "" {
		return 0, 0, false, fmt.Errorf("stock.Symbol is required")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	// v2 driver: no ctx passed to Connect
	client, err := mongo.Connect(options.Client().ApplyURI(uri))
	if err != nil {
		return 0, 0, false, err
	}
	defer client.Disconnect(ctx)

	coll := client.Database("SavedStocks").Collection("SavedStocks")

	normalizedData := stock.Data
	if len(normalizedData) > 1 {
		normalizedData = normalizedData[len(normalizedData)-1:]
	}

	normalizedSignals := latestOnlySignals(stock.Signals)
	now := time.Now().UTC()

	filter := bson.M{
		"symbol": stock.Symbol,
	}

	update := bson.M{
		"$set": bson.M{
			"symbol":    stock.Symbol,
			"data":      normalizedData,
			"signals":   normalizedSignals,
			"updatedAt": now,
		},
		"$setOnInsert": bson.M{
			"createdAt": now,
		},
	}

	// v2 driver: UpdateOne builder
	opts := options.UpdateOne().SetUpsert(true)

	res, err := coll.UpdateOne(ctx, filter, update, opts)
	if err != nil {
		return 0, 0, false, err
	}

	inserted = res.UpsertedID != nil
	return res.MatchedCount, res.ModifiedCount, inserted, nil
}

func deleteSavedStock(symbol string) (deletedCount int64, err error) {
	uri := os.Getenv("MONGODB_URI")
	if uri == "" {
		return 0, fmt.Errorf("MONGODB_URI is not set")
	}
	if symbol == "" {
		return 0, fmt.Errorf("stock.Symbol is required")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	client, err := mongo.Connect(options.Client().ApplyURI(uri))
	if err != nil {
		return 0, err
	}
	defer client.Disconnect(ctx)

	coll := client.Database("SavedStocks").Collection("SavedStocks")

	filter := bson.M{
		"symbol": symbol,
	}

	deleteResult, err := coll.DeleteOne(ctx, filter)
	if err != nil {
		return 0, err
	}

	fmt.Printf("Deleted %d documents\n", deleteResult.DeletedCount)
	return deleteResult.DeletedCount, nil
}

func analyzePortfolioWithOpenAI(holdings []HoldingSnapshot) (string, error) {
	apiKey := os.Getenv("OPENAI_API_KEY")
	if apiKey == "" {
		return "", fmt.Errorf("OPENAI_API_KEY is not set")
	}

	client := openai.NewClient(
		option.WithAPIKey(apiKey),
	)

	payload := map[string]any{
		"generatedAt": time.Now().UTC().Format(time.RFC3339),
		"holdings":    holdings,
	}

	b, err := json.MarshalIndent(payload, "", "  ")
	if err != nil {
		return "", err
	}

	prompt := fmt.Sprintf(`
You are analyzing a stock portfolio snapshot.

Rules:
- Use only the JSON provided below.
- Do not invent market news, earnings, analyst ratings, or macro events.
- Do not tell the user to buy or sell.
- Give a concise portfolio summary.
- Mention each holding.
- Point out obvious strengths or risks based on trend and performance fields only.
- If the data is limited, say so clearly.

Portfolio JSON:
%s
`, string(b))

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	resp, err := client.Responses.New(ctx, responses.ResponseNewParams{
		Model: openai.ChatModel("gpt-5.4-mini"),
		Input: responses.ResponseNewParamsInputUnion{
			OfString: openai.String(prompt),
		},
	})
	if err != nil {
		return "", err
	}

	return resp.OutputText(), nil
}

func pctChange(from, to float64) float64 {
	if from == 0 {
		return 0
	}
	return ((to - from) / from) * 100
}

func smaFromBars(bars []Bar, n int) float64 {
	if len(bars) < n || n <= 0 {
		return 0
	}
	var sum float64
	for _, b := range bars[len(bars)-n:] {
		sum += b.C
	}
	return sum / float64(n)
}

func trendLabel(price, avg float64) string {
	if avg == 0 {
		return "unknown"
	}
	if price > avg {
		return "above"
	}
	if price < avg {
		return "below"
	}
	return "at"
}
