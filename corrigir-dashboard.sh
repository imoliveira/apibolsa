#!/bin/bash
# Script para corrigir problema de arquivos do dashboard não encontrados

set -e

NAMESPACE="apibolsa"

echo "╔════════════════════════════════════════════════════════════════╗"
echo "║  🔧 CORRIGINDO DASHBOARD - ARQUIVOS NÃO ENCONTRADOS           ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""

# Verificar se está no diretório correto
if [ ! -d "nodejs" ]; then
    echo "❌ Execute este script do diretório apibolsa"
    exit 1
fi

# Verificar se oc está configurado
if ! oc get namespace $NAMESPACE &>/dev/null; then
    echo "⚠️  Configurando ambiente oc..."
    eval $(crc oc-env)
fi

# Cores
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

# 1. Verificar se os arquivos existem localmente
echo "1️⃣  Verificando arquivos locais..."
MISSING_FILES=0

for file in "nodejs/public/dashboard.html" "nodejs/public/dashboard.css" "nodejs/public/dashboard.js"; do
    if [ ! -f "$file" ]; then
        echo -e "${RED}❌ Arquivo não encontrado: $file${NC}"
        MISSING_FILES=1
    else
        echo -e "${GREEN}✅ $file${NC}"
    fi
done

if [ $MISSING_FILES -eq 1 ]; then
    echo -e "${RED}❌ Alguns arquivos estão faltando localmente!${NC}"
    exit 1
fi
echo ""

# 2. Atualizar ConfigMap
echo "2️⃣  Atualizando ConfigMap com todos os arquivos..."
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
    echo -e "${GREEN}✅ ConfigMap atualizado${NC}"
else
    echo -e "${RED}❌ Erro ao atualizar ConfigMap${NC}"
    exit 1
fi
echo ""

# 3. Verificar se os arquivos estão no ConfigMap
echo "3️⃣  Verificando arquivos no ConfigMap..."
DASHBOARD_IN_CM=$(oc get configmap nodejs-app-code -n $NAMESPACE -o jsonpath='{.data.dashboard\.html}' 2>/dev/null | head -1)
if [ -n "$DASHBOARD_IN_CM" ]; then
    echo -e "${GREEN}✅ dashboard.html está no ConfigMap${NC}"
else
    echo -e "${RED}❌ dashboard.html NÃO está no ConfigMap${NC}"
    exit 1
fi
echo ""

# 4. Deletar pods existentes para forçar recriação
echo "4️⃣  Deletando pods existentes para forçar recriação..."
oc delete pod -n $NAMESPACE -l app.kubernetes.io/name=nodejs --ignore-not-found=true
echo -e "${GREEN}✅ Pods deletados${NC}"
echo ""

# 5. Aguardar novos pods ficarem prontos
echo "5️⃣  Aguardando novos pods ficarem prontos..."
echo "   (Isso pode levar 1-2 minutos)"
oc wait --for=condition=ready pod -n $NAMESPACE -l app.kubernetes.io/name=nodejs --timeout=180s || {
    echo -e "${YELLOW}⚠️  Timeout aguardando pod. Verificando status...${NC}"
    oc get pods -n $NAMESPACE -l app.kubernetes.io/name=nodejs
    exit 1
}
echo -e "${GREEN}✅ Pods prontos${NC}"
echo ""

# 6. Verificar se os arquivos foram copiados
echo "6️⃣  Verificando se os arquivos foram copiados para o pod..."
POD_NAME=$(oc get pod -n $NAMESPACE -l app.kubernetes.io/name=nodejs -o jsonpath='{.items[0].metadata.name}')

if [ -z "$POD_NAME" ]; then
    echo -e "${RED}❌ Pod não encontrado${NC}"
    exit 1
fi

echo "   Pod: $POD_NAME"
echo ""

# Verificar cada arquivo
ALL_OK=1
for file in "dashboard.html" "dashboard.css" "dashboard.js"; do
    if oc exec -n $NAMESPACE $POD_NAME -- test -f /app/public/$file 2>/dev/null; then
        echo -e "${GREEN}✅ $file está no pod${NC}"
    else
        echo -e "${RED}❌ $file NÃO está no pod${NC}"
        ALL_OK=0
    fi
done

echo ""

if [ $ALL_OK -eq 0 ]; then
    echo -e "${YELLOW}⚠️  Alguns arquivos não foram copiados. Verificando logs do initContainer...${NC}"
    oc logs -n $NAMESPACE $POD_NAME -c copy-files 2>&1 | tail -20
    echo ""
    echo -e "${YELLOW}💡 Tentando copiar manualmente...${NC}"
    
    # Tentar copiar manualmente se o volume ainda estiver montado
    oc exec -n $NAMESPACE $POD_NAME -- sh -c "
        if [ -d /config ]; then
            mkdir -p /app/public
            cp /config/dashboard.html /app/public/ 2>&1 || echo 'Erro ao copiar dashboard.html'
            cp /config/dashboard.css /app/public/ 2>&1 || echo 'Erro ao copiar dashboard.css'
            cp /config/dashboard.js /app/public/ 2>&1 || echo 'Erro ao copiar dashboard.js'
            ls -la /app/public/ | grep dashboard
        else
            echo 'Volume /config não está montado no container principal'
        fi
    " 2>&1 || echo "Não foi possível copiar manualmente"
    
    echo ""
    echo -e "${YELLOW}⚠️  Será necessário reiniciar o deployment${NC}"
    oc rollout restart deployment/nodejs -n $NAMESPACE
    echo "   Aguardando rollout..."
    oc rollout status deployment/nodejs -n $NAMESPACE --timeout=120s
fi

echo ""

# 7. Verificação final
echo "7️⃣  Verificação final..."
FINAL_POD=$(oc get pod -n $NAMESPACE -l app.kubernetes.io/name=nodejs -o jsonpath='{.items[0].metadata.name}')
if oc exec -n $NAMESPACE $FINAL_POD -- test -f /app/public/dashboard.html 2>/dev/null; then
    echo -e "${GREEN}✅ dashboard.html confirmado no pod${NC}"
    echo ""
    echo -e "${GREEN}✅ CORREÇÃO CONCLUÍDA!${NC}"
    echo ""
    echo "🌐 Acesse: http://apibolsa.apps-crc.testing/dashboard"
else
    echo -e "${RED}❌ dashboard.html ainda não está no pod${NC}"
    echo ""
    echo "🔍 Verificando logs do initContainer:"
    oc logs -n $NAMESPACE $FINAL_POD -c copy-files 2>&1 | tail -30
    exit 1
fi





