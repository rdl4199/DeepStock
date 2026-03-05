package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"sort"
	"time"

	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
)

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

func main() {
	apiKey := "B183J50JYZ0L7NSF" //os.Getenv("ALPHAVANTAGE_API_KEY")
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
			http.Error(w, "missing ?symbol=XYZ", http.StatusBadRequest)
			return
		}
		if ce, ok := cache[symbol]; ok && time.Now().Before(ce.expiresAt) {
			respondJSON(w, ce.data)
			return
		}
		url := fmt.Sprintf(
			"https://www.alphavantage.co/query?function=TIME_SERIES_DAILY&symbol=%s&apikey=%s",
			symbol, apiKey,
		)
		resp, err := http.Get(url)
		if err != nil {
			http.Error(w, "provider error", http.StatusBadGateway)
			return
		}
		defer resp.Body.Close()

		var raw map[string]any
		if err := json.NewDecoder(resp.Body).Decode(&raw); err != nil {
			http.Error(w, "decode error", http.StatusBadGateway)
			return
		}
		ts, ok := raw["Time Series (Daily)"].(map[string]any)
		if !ok {
			fmt.Println("raw:", raw)
			http.Error(w, "no time series (rate-limited?)", http.StatusTooManyRequests)
			return
		}

		bars := make([]Bar, 0, len(ts))
		for day, v := range ts {
			row, _ := v.(map[string]any)
			t, _ := time.Parse("2006-01-02", day)
			o := atof(row["1. open"])
			h := atof(row["2. high"])
			l := atof(row["3. low"])
			c := atof(row["4. close"])
			vol := atof(row["5. volume"])
			bars = append(bars, Bar{T: t, O: o, H: h, L: l, C: c, V: vol})
		}
		sort.Slice(bars, func(i, j int) bool { return bars[i].T.Before(bars[j].T) })

		cache[symbol] = cacheEntry{data: bars, expiresAt: time.Now().Add(60 * time.Second)}
		respondJSON(w, bars)
	})

	mux.HandleFunc("/getSavedStocks", func(w http.ResponseWriter, r *http.Request) {
		mongBars, err := fetchFromMongo()
		if err != nil {
			http.Error(w, "mongo error", http.StatusBadGateway)
			return
		}
		respondJSON(w, mongBars)
	})

	mux.HandleFunc("/putSavedStocks", func(w http.ResponseWriter, r *http.Request) {

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
	w.Header().Set("Access-Control-Allow-Methods", "GET,OPTIONS")
}

func respondJSON(w http.ResponseWriter, v any) {
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(v)
}

func fetchFromMongo() (bson.M, error) {
	uri := os.Getenv("MONGODB_URI")
	log.Printf(uri)
	if uri == "" {
		return nil, fmt.Errorf("MONGODB_URI is not set")
	}

	client, err := mongo.Connect(options.Client().ApplyURI(uri))
	if err != nil {
		return nil, err
	}
	defer client.Disconnect(context.TODO())

	coll := client.Database("SavedStocks").Collection("SavedStocks")
	var result bson.M

	err = coll.FindOne(context.TODO(), bson.D{{"title", "Gertie the Dinosaur"}}).Decode(&result)
	if err != nil {
		log.Printf("MongoDB query error: %v", err)
		return nil, err
	}

	return result, nil
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
