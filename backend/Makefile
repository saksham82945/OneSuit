.PHONY: all build run run-migrate test clean

BINARY_NAME=whatomate
BINARY_PATH=./cmd/whatomate

all: build

build:
	go build -o $(BINARY_NAME) $(BINARY_PATH)

run:
	go run $(BINARY_PATH)/main.go server -config config.toml

run-migrate:
	go run $(BINARY_PATH)/main.go server -config config.toml -migrate

test:
	go test -v ./internal/...

clean:
	rm -f $(BINARY_NAME)
