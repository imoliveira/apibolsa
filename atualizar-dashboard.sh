#!/bin/bash
# Script para atualizar o dashboard financeiro no namespace apibolsa

set -e

NAMESPACE="apibolsa"

echo "🔄 Atualizando Dashboard Financeiro"
echo "===================================="
echo ""

# Cores
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Verificar se está no diretório correto
if [ ! -d "nodejs" ]; then
    echo "❌ Execute este script do diretório apibolsa"
    exit 1
fi

# 1. Atualizar ConfigMap
echo "1. Atualizando ConfigMap com novos arquivos..."
oc create configmap nodejs-app-code -n $NAMESPACE \
  --from-file=server.js=nodejs/server.js \
  --from-file=package.json=nodejs/package.json \
  --from-file=kafka-producer.js=nodejs/kafka-producer.js \
  --from-file=kafka-consumer.js=nodejs/kafka-consumer.js \
  --from-file=index.html=nodejs/public/index.html \
  --from-file=login.html=nodejs/public/login.html \
  --from-file=kafka.html=nodejs/public/kafka.html \
  --from-file=dashboard.html=nodejs/public/dashboard.html \
  --from-file=dashboard.css=nodejs/public/dashboard.css \
  --from-file=dashboard.js=nodejs/public/dashboard.js \
  --dry-run=client -o yaml | oc apply -f -
echo -e "${GREEN}✅ ConfigMap atualizado${NC}"
echo ""

# 2. Reiniciar deployment
echo "2. Reiniciando deployment Node.js..."
oc rollout restart deployment/nodejs -n $NAMESPACE
echo -e "${GREEN}✅ Deployment reiniciado${NC}"
echo ""

# 3. Aguardar rollout
echo "3. Aguardando rollout completar..."
oc rollout status deployment/nodejs -n $NAMESPACE --timeout=120s
echo -e "${GREEN}✅ Rollout completo${NC}"
echo ""

# 4. Obter URL
echo "4. URL do Dashboard:"
ROUTE=$(oc get route nginx -n $NAMESPACE -o jsonpath='{.spec.host}' 2>/dev/null || echo "")
if [ -n "$ROUTE" ]; then
    echo -e "${GREEN}   http://$ROUTE/dashboard${NC}"
    echo ""
    echo "   (Faça login primeiro em: http://$ROUTE/login)"
    echo "   Usuário: teste / Senha: teste"
else
    echo -e "${YELLOW}   Route não encontrada. Use port-forward:${NC}"
    echo "   oc port-forward svc/nginx 8080:80 -n $NAMESPACE"
    echo "   Acesse: http://localhost:8080/dashboard"
fi
echo ""

echo -e "${GREEN}✅ Dashboard atualizado com sucesso!${NC}"



