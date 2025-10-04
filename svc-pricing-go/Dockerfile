# Build
FROM golang:1.22 AS build
WORKDIR /app
COPY . .
RUN go mod init svc-pricing-go 2>/dev/null || true
RUN go mod tidy
RUN CGO_ENABLED=0 GOOS=linux go build -o svc

# Run
FROM gcr.io/distroless/base-debian12
WORKDIR /app
COPY --from=build /app/svc /app/svc
EXPOSE 8080
ENV PORT=8080
CMD ["/app/svc"]
