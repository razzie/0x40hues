VERSION ?= `git describe --tags`
BUILDFLAGS := -mod=vendor -ldflags="-s -w" -gcflags=-trimpath=$(CURDIR)
IMAGE_NAME := 0x40hues
IMAGE_REGISTRY ?= ghcr.io/razzie
FULL_IMAGE_NAME := $(IMAGE_REGISTRY)/$(IMAGE_NAME):$(VERSION)

.PHONY: build
build:
	go build $(BUILDFLAGS) .

.PHONY: docker-build
docker-build:
	docker build . -t $(FULL_IMAGE_NAME)

.PHONY: docker-push
docker-push: docker-build
	docker push $(FULL_IMAGE_NAME)
