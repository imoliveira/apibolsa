#!/bin/bash
# Script para diagnosticar problemas com Kafka

set -e

NAMESPACE="apibolsa"
KAFKA_NAMESPACE="kafka"

echo "╔════════════════════════════════════════════════════════════════╗"
echo "║  🔍 DIAGNÓSTICO DO KAFKA                                      ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""

# Cores
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

# 1. Verificar pods do Kafka
echo "1️⃣  Verificando pods do Kafka..."
oc get pods -n $KAFKA_NAMESPACE -l app.kubernetes.io/name=kafka 2>/dev/null || oc get pods -n $KAFKA_NAMESPACE | grep kafka
echo ""

# 2. Verificar serviços do Kafka
echo "2️⃣  Verificando serviços do Kafka..."
oc get svc -n $KAFKA_NAMESPACE | grep -E "NAME|kafka"
echo ""

# 3. Verificar variáveis de ambiente do Node.js
echo "3️⃣  Verificando variáveis de ambiente do Node.js..."
POD_NAME=$(oc get pods -n $NAMESPACE -l app.kubernetes.io/name=nodejs -o jsonpath='{.items[0].metadata.name}' 2>/dev/null || echo "")
if [ -n "$POD_NAME" ]; then
    echo "Pod: $POD_NAME"
    oc exec -n $NAMESPACE $POD_NAME -- env | grep -i kafka || echo "Nenhuma variável KAFKA encontrada"
else
    echo -e "${RED}❌ Pod Node.js não encontrado${NC}"
fi
echo ""

# 4. Verificar conectividade do pod ao Kafka
echo "4️⃣  Verificando conectividade ao Kafka..."
if [ -n "$POD_NAME" ]; then
    echo "Testando conexão com bootstrap server..."
    oc exec -n $NAMESPACE $POD_NAME -- timeout 5 nc -zv kafka-lab-kafka-bootstrap.kafka.svc.cluster.local 9092 2>&1 || echo -e "${YELLOW}⚠️  Não foi possível conectar${NC}"
    echo ""
    echo "Testando conexão com broker pool..."
    oc exec -n $NAMESPACE $POD_NAME -- timeout 5 nc -zv kafka-lab-kafka-lab-pool-0.kafka-lab-kafka-brokers.kafka.svc 9092 2>&1 || echo -e "${YELLOW}⚠️  Não foi possível conectar${NC}"
else
    echo -e "${RED}❌ Pod Node.js não encontrado${NC}"
fi
echo ""

# 5. Verificar logs do Kafka
echo "5️⃣  Verificando logs do Kafka (últimas 20 linhas)..."
KAFKA_POD=$(oc get pods -n $KAFKA_NAMESPACE -l app.kubernetes.io/name=kafka -o jsonpath='{.items[0].metadata.name}' 2>/dev/null || echo "")
if [ -n "$KAFKA_POD" ]; then
    oc logs -n $KAFKA_NAMESPACE $KAFKA_POD --tail=20 | tail -20
else
    echo -e "${RED}❌ Pod Kafka não encontrado${NC}"
fi
echo ""

# 6. Verificar logs do Node.js relacionados ao Kafka
echo "6️⃣  Verificando logs do Node.js relacionados ao Kafka..."
if [ -n "$POD_NAME" ]; then
    oc logs -n $NAMESPACE $POD_NAME --tail=50 | grep -i kafka | tail -20 || echo "Nenhum log relacionado ao Kafka encontrado"
else
    echo -e "${RED}❌ Pod Node.js não encontrado${NC}"
fi
echo ""

# 7. Verificar tópicos do Kafka (se possível)
echo "7️⃣  Verificando tópicos do Kafka..."
if [ -n "$KAFKA_POD" ]; then
    echo "Tentando listar tópicos..."
    oc exec -n $KAFKA_NAMESPACE $KAFKA_POD -- /bin/sh -c "kafka-topics.sh --bootstrap-server localhost:9092 --list 2>/dev/null" || echo -e "${YELLOW}⚠️  Não foi possível listar tópicos${NC}"
else
    echo -e "${RED}❌ Pod Kafka não encontrado${NC}"
fi
echo ""

echo -e "${GREEN}✅ Diagnóstico completo!${NC}"

