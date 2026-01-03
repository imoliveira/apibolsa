#!/bin/bash
# Script para deploy completo do API Bolsa

set -e

NAMESPACE="apibolsa"

echo "🚀 Deploy API Bolsa - Fase 1"
echo "============================="
echo ""

# Cores
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

# 1. Criar namespace
echo "1. Criando namespace..."
oc create namespace $NAMESPACE 2>/dev/null || echo -e "${YELLOW}⚠️  Namespace já existe${NC}"
echo -e "${GREEN}✅ Namespace criado${NC}"
echo ""

# 2. Deploy MySQL
echo "2. Deployando MySQL..."
oc apply -f mysql/mysql-secret.yaml
oc apply -f mysql/mysql-configmap.yaml
oc apply -f mysql/mysql-deployment.yaml
oc apply -f mysql/mysql-service.yaml
echo -e "${GREEN}✅ MySQL deployado${NC}"
echo ""

# 3. Aguardar MySQL estar pronto
echo "3. Aguardando MySQL ficar pronto..."
oc wait --for=condition=ready pod -l app.kubernetes.io/name=mysql -n $NAMESPACE --timeout=120s || true
echo -e "${GREEN}✅ MySQL pronto${NC}"
echo ""

# 4. Criar ConfigMap com código do Node.js
echo "4. Criando ConfigMap com código Node.js..."
# Criar ConfigMap com os arquivos (usando nomes de chave válidos)
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
echo -e "${GREEN}✅ ConfigMap criado${NC}"
echo ""

# 5. Deploy Node.js
echo "5. Deployando Node.js..."
oc apply -f nodejs/nodejs-configmap.yaml
oc apply -f nodejs/nodejs-secret.yaml
oc apply -f nodejs/nodejs-deployment.yaml
oc apply -f nodejs/nodejs-service.yaml
echo -e "${GREEN}✅ Node.js deployado${NC}"
echo ""

# 6. Aguardar Node.js estar pronto
echo "6. Aguardando Node.js ficar pronto..."
sleep 10
oc wait --for=condition=ready pod -l app.kubernetes.io/name=nodejs -n $NAMESPACE --timeout=120s || true
echo -e "${GREEN}✅ Node.js pronto${NC}"
echo ""

# 7. Deploy Nginx
echo "7. Deployando Nginx..."
oc apply -f nginx/nginx-configmap.yaml
oc apply -f nginx/nginx-deployment.yaml
oc apply -f nginx/nginx-service.yaml
oc apply -f nginx/nginx-route.yaml
echo -e "${GREEN}✅ Nginx deployado${NC}"
echo ""

# 8. Aguardar Nginx estar pronto
echo "8. Aguardando Nginx ficar pronto..."
oc wait --for=condition=ready pod -l app.kubernetes.io/name=nginx -n $NAMESPACE --timeout=120s || true
echo -e "${GREEN}✅ Nginx pronto${NC}"
echo ""

# 9. Mostrar status
echo "9. Status dos recursos:"
echo ""
echo "Pods:"
oc get pods -n $NAMESPACE
echo ""
echo "Services:"
oc get svc -n $NAMESPACE
echo ""
echo "Routes:"
oc get route -n $NAMESPACE
echo ""

# 10. Mostrar URL
echo "10. URL para acesso:"
ROUTE=$(oc get route nginx -n $NAMESPACE -o jsonpath='{.spec.host}' 2>/dev/null || echo "")
if [ -n "$ROUTE" ]; then
    echo -e "${GREEN}✅ Acesse: http://$ROUTE${NC}"
else
    echo -e "${YELLOW}⚠️  Route não encontrada${NC}"
fi

echo ""
echo "=========================================="
echo -e "${GREEN}✅ Deploy concluído!${NC}"
echo ""
echo "Para testar a conexão com o banco:"
echo "  1. Acesse a URL acima"
echo "  2. Clique em 'Testar Conexão'"
echo "  3. Execute queries SQL de teste"

