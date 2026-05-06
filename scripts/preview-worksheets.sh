#!/bin/bash
# Testa os 4 templates de worksheet localmente.
# Uso: bash scripts/preview-worksheets.sh

set -e

URL="https://dmtbhodwjfxefhkpvzzo.supabase.co/functions/v1/render-worksheet"
DIR="/tmp/tupi-worksheets"
mkdir -p "$DIR"

echo "→ Testando silabica (BULE)..."
curl -sS -X POST "$URL" -H "Content-Type: application/json" -d '{
  "type": "silabica",
  "palavra": "BULE",
  "silabas": ["BU", "LE"],
  "imagem_prompt": "old fashioned teapot with flowers, simple line drawing"
}' > "$DIR/1-silabica.html"

echo "→ Testando completar_lacuna..."
curl -sS -X POST "$URL" -H "Content-Type: application/json" -d '{
  "type": "completar_lacuna",
  "titulo": "Complete as frases",
  "exercicios": [
    {"frase": "A ____ é redonda.", "resposta": "BOLA", "imagem_prompt": "soccer ball"},
    {"frase": "O ____ mia.", "resposta": "GATO", "imagem_prompt": "cute cat"},
    {"frase": "A ____ é uma fruta vermelha.", "resposta": "MAÇÃ", "imagem_prompt": "red apple"}
  ]
}' > "$DIR/2-completar.html"

echo "→ Testando ligar_palavra_imagem..."
curl -sS -X POST "$URL" -H "Content-Type: application/json" -d '{
  "type": "ligar_palavra_imagem",
  "titulo": "Ligue a palavra à imagem",
  "pares": [
    {"palavra": "MAÇÃ", "imagem_prompt": "red apple"},
    {"palavra": "CASA", "imagem_prompt": "small house"},
    {"palavra": "GATO", "imagem_prompt": "cute cat"},
    {"palavra": "BOLA", "imagem_prompt": "soccer ball"}
  ]
}' > "$DIR/3-ligar.html"

echo "→ Testando copie..."
curl -sS -X POST "$URL" -H "Content-Type: application/json" -d '{
  "type": "copie",
  "titulo": "Copie as palavras",
  "itens": [
    {"palavra": "GATO", "imagem_prompt": "cute cat", "linhas": 2},
    {"palavra": "PATO", "imagem_prompt": "yellow duck", "linhas": 2},
    {"palavra": "BOLA", "imagem_prompt": "soccer ball", "linhas": 2}
  ]
}' > "$DIR/4-copie.html"

echo ""
echo "Pronto! Abrindo os 4 no navegador..."
open "$DIR/1-silabica.html"
open "$DIR/2-completar.html"
open "$DIR/3-ligar.html"
open "$DIR/4-copie.html"
echo ""
echo "Arquivos em: $DIR"
