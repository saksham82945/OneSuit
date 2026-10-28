.PHONY: all build build-prod run dev test test-backend test-frontend clean frontend-dev frontend-build backend-build

all: build

# Build both backend and frontend
build: backend-build frontend-build

backend-build:
	cd backend && go build -o whatomate ./cmd/whatomate

backend-run:
	cd backend && go run ./cmd/whatomate/main.go server -config config.toml

backend-migrate:
	cd backend && go run ./cmd/whatomate/main.go server -config config.toml -migrate

# Build production binary with embedded frontend
build-prod: frontend-build embed-frontend
	cd backend && CGO_ENABLED=0 go build -ldflags "-s -w" -o whatomate ./cmd/whatomate
	@echo "Production binary built in backend/whatomate"

embed-frontend:
	@echo "Copying frontend build into backend embed directory..."
	@rm -rf backend/internal/frontend/dist/*
	@mkdir -p backend/internal/frontend/dist
	@cp -r frontend/dist/* backend/internal/frontend/dist/
	@echo "Frontend embedded successfully"

# Frontend commands
frontend-install:
	cd frontend && npm install

frontend-dev:
	cd frontend && npm run dev

frontend-build:
	cd frontend && npm run build

frontend-preview:
	cd frontend && npm run preview

# Tests
test: test-backend test-frontend

test-backend:
	cd backend && go test -v ./internal/...

test-frontend:
	cd frontend && npm test -- --run

# Development - run both
dev:
	@echo "Run backend in one terminal: make backend-run"
	@echo "Run frontend in another terminal: make frontend-dev"

clean:
	rm -f backend/whatomate
	rm -rf frontend/dist
