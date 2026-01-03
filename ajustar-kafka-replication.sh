#!/bin/bash
# Script para ajustar replication factor do Kafka

set -e

KAFKA_NAMESPACE="kafka"
KAFKA_NAME="kafka-lab"
NODEJS_NAMESPACE="apibolsa"

echo "╔════════════════════════════════════════════════════════════════╗"
echo "║  🔧 AJUSTANDO KAFKA - REPLICATION FACTOR                      ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""

# Cores
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

# Verificar se Kafka existe
echo "1️⃣  Verificando Kafka..."
if ! oc get kafka $KAFKA_NAME -n $KAFKA_NAMESPACE &>/dev/null; then
    echo -e "${RED}❌ Kafka '$KAFKA_NAME' não encontrado no namespace '$KAFKA_NAMESPACE'${NC}"
    exit 1
fi
echo -e "${GREEN}✅ Kafka encontrado${NC}"
echo ""

# Verificar configuração atual
echo "2️⃣  Verificando configuração atual..."
CURRENT_CONFIG=$(oc get kafka $KAFKA_NAME -n $KAFKA_NAMESPACE -o jsonpath='{.spec.kafka.config}' 2>/dev/null || echo "{}")
echo "Configuração atual:"
echo "$CURRENT_CONFIG" | grep -E "replication|default" || echo "  (nenhuma configuração de replication encontrada)"
echo ""

# Aplicar patch para adicionar configurações
echo "3️⃣  Aplicando configurações de replication factor..."
oc patch kafka $KAFKA_NAME -n $KAFKA_NAMESPACE --type=merge -p '{
  "spec": {
    "kafka": {
      "config": {
        "default.replication.factor": "1",
        "offsets.topic.replication.factor": "1",
        "transaction.state.log.replication.factor": "1",
        "transaction.state.log.min.isr": "1",
        "min.insync.replicas": "1"
      }
    }
  }
}' || {
    echo -e "${YELLOW}⚠️  Patch falhou. Tentando edição manual...${NC}"
    echo ""
    echo "Execute manualmente:"
    echo "  oc edit kafka $KAFKA_NAME -n $KAFKA_NAMESPACE"
    echo ""
    echo "E adicione no spec.kafka.config:"
    echo "  default.replication.factor: \"1\""
    echo "  offsets.topic.replication.factor: \"1\""
    echo "  transaction.state.log.replication.factor: \"1\""
    exit 1
}

echo -e "${GREEN}✅ Configurações aplicadas${NC}"
echo ""

# Aguardar Kafka reiniciar
echo "4️⃣  Aguardando Kafka reiniciar (pode levar 2-3 minutos)..."
echo "   Isso é normal, o Kafka precisa reiniciar para aplicar as mudanças"
oc wait --for=condition=Ready kafka/$KAFKA_NAME -n $KAFKA_NAMESPACE --timeout=300s || {
    echo -e "${YELLOW}⚠️  Timeout aguardando Kafka. Verificando status...${NC}"
    oc get kafka $KAFKA_NAME -n $KAFKA_NAMESPACE
    oc get pods -n $KAFKA_NAMESPACE -l strimzi.io/kind=Kafka
    echo ""
    echo "Continue aguardando ou verifique os logs:"
    echo "  oc logs -n $KAFKA_NAMESPACE -l strimzi.io/kind=Kafka --tail=50"
}
echo -e "${GREEN}✅ Kafka reiniciado${NC}"
echo ""

# Aguardar um pouco mais para garantir que está totalmente pronto
echo "5️⃣  Aguardando Kafka ficar totalmente pronto..."
sleep 10
oc wait --for=condition=ready pod -n $KAFKA_NAMESPACE -l strimzi.io/kind=Kafka --timeout=60s || true
echo ""

# Reiniciar Node.js
echo "6️⃣  Reiniciando Node.js para reconectar ao Kafka..."
oc rollout restart deployment/nodejs -n $NODEJS_NAMESPACE
echo -e "${GREEN}✅ Node.js reiniciado${NC}"
echo ""

# Aguardar rollout
echo "7️⃣  Aguardando rollout do Node.js..."
oc rollout status deployment/nodejs -n $NODEJS_NAMESPACE --timeout=120s
echo ""

# Verificar logs
echo "8️⃣  Verificando logs do Node.js (aguardando 10 segundos)..."
sleep 10
echo ""
echo "Últimas linhas relacionadas ao Kafka:"
oc logs -n $NODEJS_NAMESPACE -l app.kubernetes.io/name=nodejs --tail=50 | grep -i kafka | tail -10 || echo "  (nenhum log relacionado ao Kafka encontrado ainda)"
echo ""

echo -e "${GREEN}✅ Ajuste concluído!${NC}"
echo ""
echo "📋 PRÓXIMOS PASSOS:"
echo ""
echo "1. Aguarde alguns segundos e verifique os logs:"
echo "   oc logs -n $NODEJS_NAMESPACE -l app.kubernetes.io/name=nodejs --tail=50 | grep -i kafka"
echo ""
echo "2. Você deve ver mensagens como:"
echo "   ✅ Consumer iniciado para tópico: pedidos"
echo "   ✅ Consumer iniciado para tópico: pagamentos"
echo "   ✅ Consumer iniciado para tópico: notificacoes"
echo "   ✅ Consumer iniciado para tópico: logs"
echo ""
echo "3. Se ainda houver erros, execute o diagnóstico:"
echo "   cd /home/ioliveira/Documentos/sei-ia/healthchecker/apibolsa"
echo "   ./diagnosticar-kafka.sh"
echo ""

