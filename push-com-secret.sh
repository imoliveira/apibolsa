#!/bin/bash
# Script para fazer push usando o secret APIBOLSADASHBOARD

set -e

echo "🚀 Fazendo push para GitHub usando secret..."
echo "=============================================="
echo ""

# Verificar se está no diretório correto
if [ ! -d ".git" ]; then
    echo "❌ Erro: Execute este script do diretório apibolsa"
    exit 1
fi

# Verificar remote
REMOTE=$(git remote get-url origin 2>/dev/null || echo "")
if [ -z "$REMOTE" ]; then
    echo "❌ Remote não configurado"
    exit 1
fi

echo "📦 Remote: $REMOTE"
echo ""

# Verificar se há commits
if ! git rev-parse --verify HEAD >/dev/null 2>&1; then
    echo "❌ Nenhum commit encontrado"
    exit 1
fi

echo "✅ Commit encontrado:"
git log --oneline -1
echo ""

echo "🔐 INSTRUÇÕES PARA AUTENTICAÇÃO:"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "⚠️  IMPORTANTE:"
echo ""
echo "Se o secret 'APIBOLSADASHBOARD' é um GitHub Secret (Actions),"
echo "você precisará criar um Personal Access Token:"
echo ""
echo "1. Acesse: https://github.com/settings/tokens/new"
echo "2. Nome: 'apibolsa-push'"
echo "3. Escopo: marque 'repo'"
echo "4. Generate token"
echo "5. Copie o token"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "🔄 Fazendo push..."
echo ""
echo "Quando pedir credenciais:"
echo "  Username: imoliveira"
echo "  Password: Cole o token (não sua senha do GitHub!)"
echo ""

# Tentar fazer push
git push -u origin main

echo ""
echo "✅ Push concluído com sucesso!"
echo "🌐 Repositório: https://github.com/imoliveira/apibolsa"

