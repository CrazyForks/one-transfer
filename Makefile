-include .env

.PHONY: build deploy

build:
	pnpm run build

deploy: build
	pnpm exec wrangler pages deploy
