FROM golang:alpine AS builder

WORKDIR /build
COPY go.mod go.sum ./
RUN go mod download

COPY . .
RUN CGO_ENABLED=0 go build -o /build/architree ./cmd/server

FROM alpine:latest

RUN apk add --no-cache ca-certificates tzdata
COPY --from=builder /build/architree /usr/local/bin/architree

EXPOSE 8080

ENTRYPOINT ["architree"]
