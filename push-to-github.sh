#!/bin/bash
# Script para fazer push do projeto apibolsa para o GitHub

set -e

echo "🚀 Fazendo push para GitHub..."
echo "=================================="
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

# Tentar fazer push
echo "🔄 Fazendo push para origin/main..."
echo ""
echo "⚠️  Se pedir credenciais:"
echo "   - Usuário: imoliveira"
echo "   - Senha: Use um Personal Access Token do GitHub"
echo "   - Criar token: https://github.com/settings/tokens/new"
echo ""

git push -u origin main

echo ""
echo "✅ Push concluído com sucesso!"
echo "🌐 Repositório: https://github.com/imoliveira/apibolsa"



