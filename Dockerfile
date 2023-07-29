FROM golang:1.20 as builder
WORKDIR /workspace
COPY . .
RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 make

FROM ubuntu as respacks
RUN apt-get update && apt-get install -y wget unzip
WORKDIR /workspace
COPY unpack.sh .
RUN chmod +x unpack.sh
RUN wget --no-verbose --no-parent --no-directories -r https://0x40.mon.im/respacks/ --accept '*.zip'
RUN ./unpack.sh
RUN rm *.zip

FROM alpine
WORKDIR /
RUN mkdir -p respacks
COPY --from=respacks /workspace/* ./respacks/
COPY ./respacks/builtin ./respacks/
COPY --from=builder /workspace/0x40hues .
ENTRYPOINT ["/0x40hues"]