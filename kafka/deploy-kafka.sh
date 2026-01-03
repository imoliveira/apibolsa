#!/bin/bash

set -e

NAMESPACE="apibolsa"
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${GREEN}🚀 Deploy Apache Kafka - API Bolsa${NC}"
echo "=============================="
echo ""

# Verificar se Strimzi Operator está instalado
echo "1. Verificando Strimzi Operator..."
if oc get crd kafkas.kafka.strimzi.io > /dev/null 2>&1; then
    echo -e "${GREEN}✅ Strimzi Operator encontrado${NC}"
else
    echo -e "${RED}❌ Strimzi Operator não encontrado${NC}"
    echo ""
    echo "Instale o Strimzi Operator:"
    echo "  oc apply -f https://strimzi.io/install/latest?namespace=apibolsa"
    exit 1
fi
echo ""

# Criar Kafka Cluster
echo "2. Criando Kafka Cluster..."
oc apply -f kafka-cluster.yaml
echo -e "${GREEN}✅ Kafka Cluster criado${NC}"
echo ""

# Aguardar Kafka ficar pronto
echo "3. Aguardando Kafka ficar pronto (pode levar alguns minutos)..."
oc wait --for=condition=Ready kafka/apibolsa-kafka -n $NAMESPACE --timeout=600s || {
    echo -e "${YELLOW}⚠️  Timeout aguardando Kafka. Verificando status...${NC}"
    oc get kafka -n $NAMESPACE
    oc get pods -n $NAMESPACE | grep kafka
}
echo ""

# Criar tópicos
echo "4. Criando tópicos Kafka..."
oc apply -f kafka-topics.yaml
echo -e "${GREEN}✅ Tópicos criados${NC}"
echo ""

# Aguardar tópicos ficarem prontos
echo "5. Aguardando tópicos ficarem prontos..."
sleep 10
oc get kafkatopic -n $NAMESPACE
echo ""

# Status final
echo "6. Status dos recursos:"
echo ""
echo "Kafka Cluster:"
oc get kafka -n $NAMESPACE
echo ""
echo "Kafka Pods:"
oc get pods -n $NAMESPACE | grep -E "kafka|zookeeper"
echo ""
echo "Tópicos:"
oc get kafkatopic -n $NAMESPACE
echo ""

# Obter bootstrap server
BOOTSTRAP=$(oc get kafka apibolsa-kafka -n $NAMESPACE -o jsonpath='{.status.listeners[?(@.type=="plain")].bootstrapServers}' 2>/dev/null || echo "apibolsa-kafka-kafka-bootstrap:9092")
echo -e "${GREEN}✅ Kafka deployado!${NC}"
echo ""
echo "Configuração para Node.js:"
echo "  KAFKA_BROKERS=$BOOTSTRAP"
echo ""
echo "Tópicos criados:"
echo "  - pedidos"
echo "  - pagamentos"
echo "  - notificacoes"
echo "  - logs"
echo ""



