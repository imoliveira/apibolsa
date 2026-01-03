#!/bin/bash

set -e

NAMESPACE="apibolsa"
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}🧪 Testar Apache Kafka - API Bolsa${NC}"
echo "=============================="
echo ""

# Obter URL
ROUTE=$(oc get route -n $NAMESPACE -o jsonpath='{.items[0].spec.host}' 2>/dev/null)
if [ -z "$ROUTE" ]; then
    echo "❌ Route não encontrada"
    exit 1
fi

echo -e "${GREEN}URL: http://$ROUTE${NC}"
echo ""

# 1. Fazer login
echo "1. Fazendo login..."
LOGIN_RESPONSE=$(curl -s -X POST http://$ROUTE/api/login \
  -H "Content-Type: application/json" \
  -d '{"username":"teste","password":"teste"}' \
  -c /tmp/kafka-test-cookies.txt)

if echo "$LOGIN_RESPONSE" | grep -q "success"; then
    echo -e "${GREEN}✅ Login realizado${NC}"
else
    echo "❌ Erro no login: $LOGIN_RESPONSE"
    exit 1
fi
echo ""

# 2. Verificar status do Kafka
echo "2. Verificando status do Kafka..."
KAFKA_STATUS=$(curl -s http://$ROUTE/api/kafka/status -b /tmp/kafka-test-cookies.txt)
echo "$KAFKA_STATUS" | jq '.' 2>/dev/null || echo "$KAFKA_STATUS"
echo ""

# 3. Testar Producer - Enviar pedido
echo "3. Testando Producer - Enviar pedido..."
PEDIDO_RESPONSE=$(curl -s -X POST http://$ROUTE/api/kafka/pedidos \
  -H "Content-Type: application/json" \
  -b /tmp/kafka-test-cookies.txt \
  -d '{
    "id": "PED-'$(date +%s)'",
    "cliente": "João Silva",
    "valor": 150.00,
    "itens": ["Item 1", "Item 2"],
    "status": "novo"
  }')

echo "$PEDIDO_RESPONSE" | jq '.' 2>/dev/null || echo "$PEDIDO_RESPONSE"
echo ""

sleep 2

# 4. Testar Producer - Enviar pagamento
echo "4. Testando Producer - Enviar pagamento..."
PAGAMENTO_RESPONSE=$(curl -s -X POST http://$ROUTE/api/kafka/pagamentos \
  -H "Content-Type: application/json" \
  -b /tmp/kafka-test-cookies.txt \
  -d '{
    "id": "PAG-'$(date +%s)'",
    "pedidoId": "PED-123",
    "valor": 150.00,
    "metodo": "cartao",
    "status": "aprovado"
  }')

echo "$PAGAMENTO_RESPONSE" | jq '.' 2>/dev/null || echo "$PAGAMENTO_RESPONSE"
echo ""

sleep 2

# 5. Testar Producer - Enviar notificação
echo "5. Testando Producer - Enviar notificação..."
NOTIF_RESPONSE=$(curl -s -X POST http://$ROUTE/api/kafka/notificacoes \
  -H "Content-Type: application/json" \
  -b /tmp/kafka-test-cookies.txt \
  -d '{
    "id": "NOT-'$(date +%s)'",
    "usuario": "teste",
    "titulo": "Pedido confirmado",
    "mensagem": "Seu pedido foi confirmado com sucesso!"
  }')

echo "$NOTIF_RESPONSE" | jq '.' 2>/dev/null || echo "$NOTIF_RESPONSE"
echo ""

sleep 2

# 6. Testar Producer - Enviar log
echo "6. Testando Producer - Enviar log..."
LOG_RESPONSE=$(curl -s -X POST http://$ROUTE/api/kafka/logs \
  -H "Content-Type: application/json" \
  -b /tmp/kafka-test-cookies.txt \
  -d '{
    "nivel": "info",
    "mensagem": "Teste de log do Kafka",
    "contexto": {
      "servico": "apibolsa",
      "acao": "teste"
    }
  }')

echo "$LOG_RESPONSE" | jq '.' 2>/dev/null || echo "$LOG_RESPONSE"
echo ""

sleep 3

# 7. Verificar mensagens recebidas
echo "7. Verificando mensagens recebidas..."
echo ""
echo "=== Mensagens de Pedidos ==="
curl -s http://$ROUTE/api/kafka/messages/pedidos -b /tmp/kafka-test-cookies.txt | jq '.messages[0:3]' 2>/dev/null || echo "Nenhuma mensagem"
echo ""

echo "=== Mensagens de Pagamentos ==="
curl -s http://$ROUTE/api/kafka/messages/pagamentos -b /tmp/kafka-test-cookies.txt | jq '.messages[0:3]' 2>/dev/null || echo "Nenhuma mensagem"
echo ""

echo "=== Mensagens de Notificações ==="
curl -s http://$ROUTE/api/kafka/messages/notificacoes -b /tmp/kafka-test-cookies.txt | jq '.messages[0:3]' 2>/dev/null || echo "Nenhuma mensagem"
echo ""

echo "=== Mensagens de Logs ==="
curl -s http://$ROUTE/api/kafka/messages/logs -b /tmp/kafka-test-cookies.txt | jq '.messages[0:3]' 2>/dev/null || echo "Nenhuma mensagem"
echo ""

# 8. Resumo
echo "=============================="
echo -e "${GREEN}📊 Resumo do Teste${NC}"
echo "=============================="
echo ""
echo "✅ Testes realizados:"
echo "  1. Login"
echo "  2. Status do Kafka"
echo "  3. Producer - Pedidos"
echo "  4. Producer - Pagamentos"
echo "  5. Producer - Notificações"
echo "  6. Producer - Logs"
echo "  7. Consumer - Mensagens recebidas"
echo ""
echo -e "${BLUE}🌐 Acesse a interface web:${NC}"
echo "   http://$ROUTE/kafka"
echo ""
echo "Limpeza:"
rm -f /tmp/kafka-test-cookies.txt
echo "✅ Cookies removidos"



