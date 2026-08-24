FROM golang:1.26-alpine AS builder
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build -o /out/api ./cmd/api

FROM alpine:3.22
RUN apk add --no-cache ca-certificates
COPY --from=builder /out/api /usr/local/bin/api
ENV HOST=0.0.0.0 \
	PORT=4000
EXPOSE 4000
ENTRYPOINT ["api"]
