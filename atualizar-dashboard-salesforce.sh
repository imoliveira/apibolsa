#!/bin/bash
# Script para atualizar o dashboard com novo layout estilo Salesforce

set -e

NAMESPACE="apibolsa"

echo "🚀 Atualizando Dashboard - Estilo Salesforce"
echo "============================================="
echo ""

# Cores
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

# Verificar se está no diretório correto
if [ ! -f "nodejs/public/dashboard.html" ]; then
    echo -e "${RED}❌ Erro: Execute este script do diretório raiz do projeto apibolsa${NC}"
    exit 1
fi

# Verificar se o namespace existe
if ! oc get namespace $NAMESPACE &>/dev/null; then
    echo -e "${RED}❌ Erro: Namespace '$NAMESPACE' não encontrado${NC}"
    echo "Execute primeiro: oc create namespace $NAMESPACE"
    exit 1
fi

echo -e "${BLUE}📦 Atualizando ConfigMap com novos arquivos do dashboard...${NC}"

# Atualizar ConfigMap com os novos arquivos
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

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ ConfigMap atualizado com sucesso${NC}"
else
    echo -e "${RED}❌ Erro ao atualizar ConfigMap${NC}"
    exit 1
fi

echo ""
echo -e "${BLUE}🔄 Reiniciando deployment Node.js para aplicar mudanças...${NC}"

# Reiniciar o deployment para aplicar as mudanças
oc rollout restart deployment/nodejs -n $NAMESPACE

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ Deployment reiniciado${NC}"
else
    echo -e "${RED}❌ Erro ao reiniciar deployment${NC}"
    exit 1
fi

echo ""
echo -e "${BLUE}⏳ Aguardando deployment ficar pronto...${NC}"

# Aguardar o deployment ficar pronto
oc wait --for=condition=available deployment/nodejs -n $NAMESPACE --timeout=180s

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ Deployment pronto!${NC}"
else
    echo -e "${YELLOW}⚠️  Timeout aguardando deployment (pode estar ainda iniciando)${NC}"
fi

echo ""
echo -e "${BLUE}📊 Status do deployment:${NC}"
oc get pods -l app.kubernetes.io/name=nodejs -n $NAMESPACE

echo ""
echo -e "${BLUE}🌐 URL para acesso:${NC}"
ROUTE=$(oc get route nginx -n $NAMESPACE -o jsonpath='{.spec.host}' 2>/dev/null || echo "")
if [ -n "$ROUTE" ]; then
    echo -e "${GREEN}✅ Dashboard: http://$ROUTE/dashboard${NC}"
    echo -e "${GREEN}✅ Login: http://$ROUTE/login${NC}"
else
    echo -e "${YELLOW}⚠️  Route não encontrada${NC}"
    echo "Use: oc get route -n $NAMESPACE"
fi

echo ""
echo "=========================================="
echo -e "${GREEN}✅ Atualização concluída!${NC}"
echo ""
echo "Mudanças aplicadas:"
echo "  ✅ Layout estilo Salesforce"
echo "  ✅ Barra de navegação superior com pesquisa"
echo "  ✅ Menus dropdown organizados"
echo "  ✅ Boxes transformados em seções navegáveis"
echo ""
echo "Acesse o dashboard para ver as mudanças!"


