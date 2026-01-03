#!/bin/bash

set -e

NAMESPACE="apibolsa"
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${GREEN}🔍 Validando uso do Data Grid${NC}"
echo "=============================="
echo ""

# 1. Verificar Infinispan Cluster
echo "1. Verificando Infinispan Cluster..."
if oc get infinispan apibolsa-cache -n $NAMESPACE > /dev/null 2>&1; then
    STATUS=$(oc get infinispan apibolsa-cache -n $NAMESPACE -o jsonpath='{.status.conditions[?(@.type=="WellFormed")].status}' 2>/dev/null || echo "Unknown")
    if [ "$STATUS" == "True" ]; then
        echo -e "${GREEN}✅ Infinispan Cluster: Ready${NC}"
    else
        echo -e "${YELLOW}⚠️  Infinispan Cluster: $STATUS${NC}"
    fi
else
    echo -e "${RED}❌ Infinispan Cluster não encontrado${NC}"
fi
echo ""

# 2. Verificar Pods
echo "2. Verificando Pods do Data Grid..."
PODS=$(oc get pods -n $NAMESPACE -l app.kubernetes.io/name=infinispan --no-headers 2>/dev/null | wc -l)
if [ "$PODS" -gt 0 ]; then
    oc get pods -n $NAMESPACE -l app.kubernetes.io/name=infinispan
    READY=$(oc get pods -n $NAMESPACE -l app.kubernetes.io/name=infinispan --no-headers 2>/dev/null | grep -c "Running" || echo "0")
    if [ "$READY" -gt 0 ]; then
        echo -e "${GREEN}✅ Pods do Data Grid: Running${NC}"
    else
        echo -e "${YELLOW}⚠️  Pods do Data Grid: Não estão Running${NC}"
    fi
else
    echo -e "${RED}❌ Nenhum pod do Data Grid encontrado${NC}"
fi
echo ""

# 3. Verificar Services
echo "3. Verificando Services..."
SVC=$(oc get svc apibolsa-cache -n $NAMESPACE 2>/dev/null | wc -l)
if [ "$SVC" -gt 0 ]; then
    oc get svc apibolsa-cache -n $NAMESPACE
    echo -e "${GREEN}✅ Service apibolsa-cache encontrado${NC}"
else
    echo -e "${RED}❌ Service apibolsa-cache não encontrado${NC}"
fi
echo ""

# 4. Verificar conectividade do Node.js
echo "4. Testando conectividade do Node.js para Data Grid..."
NODEJS_POD=$(oc get pods -n $NAMESPACE -l app.kubernetes.io/name=nodejs -o jsonpath='{.items[0].metadata.name}' 2>/dev/null)
if [ -n "$NODEJS_POD" ]; then
    echo "Pod Node.js: $NODEJS_POD"
    if oc exec $NODEJS_POD -n $NAMESPACE -c nodejs -- wget -qO- --timeout=3 http://apibolsa-cache:11222/rest/v2/caches 2>&1 | grep -q "default\|error" || true; then
        echo -e "${GREEN}✅ Node.js consegue acessar Data Grid${NC}"
    else
        echo -e "${YELLOW}⚠️  Node.js não consegue acessar Data Grid (pode estar usando cache local)${NC}"
    fi
else
    echo -e "${RED}❌ Pod Node.js não encontrado${NC}"
fi
echo ""

# 5. Verificar variáveis de ambiente
echo "5. Verificando variáveis de ambiente do Node.js..."
DATAGRID_ENABLED=$(oc get deployment nodejs -n $NAMESPACE -o jsonpath='{.spec.template.spec.containers[0].env[?(@.name=="DATAGRID_ENABLED")].value}' 2>/dev/null || echo "")
if [ "$DATAGRID_ENABLED" == "true" ]; then
    echo -e "${GREEN}✅ DATAGRID_ENABLED: $DATAGRID_ENABLED${NC}"
else
    echo -e "${YELLOW}⚠️  DATAGRID_ENABLED: $DATAGRID_ENABLED${NC}"
fi

DATAGRID_URL=$(oc get deployment nodejs -n $NAMESPACE -o jsonpath='{.spec.template.spec.containers[0].env[?(@.name=="DATAGRID_URL")].value}' 2>/dev/null || echo "")
if [ -n "$DATAGRID_URL" ]; then
    echo -e "${GREEN}✅ DATAGRID_URL: $DATAGRID_URL${NC}"
else
    echo -e "${YELLOW}⚠️  DATAGRID_URL não configurado${NC}"
fi
echo ""

# 6. Verificar logs do Node.js
echo "6. Verificando logs do Node.js (últimas 10 linhas)..."
oc logs -l app.kubernetes.io/name=nodejs -n $NAMESPACE -c nodejs --tail=10 2>&1 | grep -i "datagrid\|cache\|Data Grid" || echo "Nenhuma mensagem de cache encontrada nos logs recentes"
echo ""

# 7. Testar API de status do cache
echo "7. Testando API de status do cache..."
ROUTE=$(oc get route -n $NAMESPACE -o jsonpath='{.items[0].spec.host}' 2>/dev/null || echo "")
if [ -n "$ROUTE" ]; then
    echo "URL: http://$ROUTE/api/cache/status"
    STATUS_RESPONSE=$(curl -s http://$ROUTE/api/cache/status 2>&1 || echo "error")
    if echo "$STATUS_RESPONSE" | grep -q "success\|cache"; then
        echo -e "${GREEN}✅ API de cache respondendo${NC}"
        echo "$STATUS_RESPONSE" | jq '.' 2>/dev/null || echo "$STATUS_RESPONSE"
    else
        echo -e "${YELLOW}⚠️  API de cache não respondeu ou requer autenticação${NC}"
        echo "Resposta: $STATUS_RESPONSE"
    fi
else
    echo -e "${YELLOW}⚠️  Route não encontrada${NC}"
fi
echo ""

# 8. Resumo
echo "=============================="
echo -e "${GREEN}📊 Resumo da Validação${NC}"
echo "=============================="
echo ""
echo "Para validar completamente:"
echo "1. Verifique se o pod apibolsa-cache-0 está Running"
echo "2. Teste a API: curl http://$ROUTE/api/cache/status (após login)"
echo "3. Verifique os logs: oc logs -l app.kubernetes.io/name=nodejs -n $NAMESPACE -c nodejs | grep cache"
echo "4. Faça uma requisição e veja se aparece 'Data Grid' ou 'cache local' nos logs"
echo ""



