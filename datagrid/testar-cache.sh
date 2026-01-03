#!/bin/bash

NAMESPACE="apibolsa"
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${GREEN}🧪 Testando Cache - Data Grid${NC}"
echo "=============================="
echo ""

# Obter URL
ROUTE=$(oc get route -n $NAMESPACE -o jsonpath='{.items[0].spec.host}' 2>/dev/null)
if [ -z "$ROUTE" ]; then
    echo "❌ Route não encontrada"
    exit 1
fi

echo "URL: http://$ROUTE"
echo ""

# 1. Fazer login
echo "1. Fazendo login..."
LOGIN_RESPONSE=$(curl -s -X POST http://$ROUTE/api/login \
  -H "Content-Type: application/json" \
  -d '{"username":"teste","password":"teste"}' \
  -c /tmp/cookies.txt)

if echo "$LOGIN_RESPONSE" | grep -q "success"; then
    echo -e "${GREEN}✅ Login realizado${NC}"
else
    echo "❌ Erro no login: $LOGIN_RESPONSE"
    exit 1
fi
echo ""

# 2. Verificar status do cache
echo "2. Verificando status do cache..."
CACHE_STATUS=$(curl -s http://$ROUTE/api/cache/status -b /tmp/cookies.txt)
echo "$CACHE_STATUS" | jq '.' 2>/dev/null || echo "$CACHE_STATUS"
echo ""

# 3. Testar cache de conexão
echo "3. Testando cache de conexão..."
echo "Primeira chamada (busca do banco):"
FIRST=$(curl -s http://$ROUTE/api/test-connection -b /tmp/cookies.txt)
echo "$FIRST" | jq '{success, fromCache, timestamp}' 2>/dev/null || echo "$FIRST"
echo ""

sleep 2

echo "Segunda chamada (deve vir do cache):"
SECOND=$(curl -s http://$ROUTE/api/test-connection -b /tmp/cookies.txt)
echo "$SECOND" | jq '{success, fromCache, timestamp}' 2>/dev/null || echo "$SECOND"
echo ""

# 4. Verificar logs
echo "4. Últimas mensagens de cache nos logs:"
oc logs -l app.kubernetes.io/name=nodejs -n $NAMESPACE -c nodejs --tail=5 2>&1 | grep -i "cache\|datagrid" | tail -3
echo ""

# 5. Resumo
echo "=============================="
echo -e "${GREEN}📊 Resumo${NC}"
echo "=============================="
echo ""
if echo "$CACHE_STATUS" | grep -q '"type": "Data Grid"'; then
    echo -e "${GREEN}✅ Usando Data Grid${NC}"
elif echo "$CACHE_STATUS" | grep -q '"type": "Local"'; then
    echo -e "${YELLOW}⚠️  Usando cache local (fallback)${NC}"
else
    echo -e "${YELLOW}⚠️  Status desconhecido${NC}"
fi

if echo "$SECOND" | grep -q '"fromCache": true'; then
    echo -e "${GREEN}✅ Cache funcionando (segunda chamada veio do cache)${NC}"
else
    echo -e "${YELLOW}⚠️  Cache pode não estar funcionando${NC}"
fi
echo ""



