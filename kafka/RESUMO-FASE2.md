# 🚀 Fase 2 - Apache Kafka - Resumo

## ✅ Implementação Completa

### 1. Kafka Cluster
- ✅ Cluster `apibolsa-kafka` criado
- ✅ Versão 3.6.0
- ✅ 1 réplica (desenvolvimento)
- ⏳ Aguardando inicialização completa

### 2. Tópicos Kafka (4)
- ✅ **pedidos** - 3 partições
- ✅ **pagamentos** - 3 partições
- ✅ **notificacoes** - 3 partições
- ✅ **logs** - 3 partições

### 3. Producer Node.js
- ✅ `kafka-producer.js` implementado
- ✅ Funções específicas para cada tópico
- ✅ Suporte a chaves e batch
- ✅ APIs REST para envio

### 4. Consumer Node.js
- ✅ `kafka-consumer.js` implementado
- ✅ Consumo automático de todos os tópicos
- ✅ WebSocket para streaming em tempo real
- ✅ Armazenamento das últimas 100 mensagens

### 5. Interface Web
- ✅ Dashboard `/kafka` criado
- ✅ Producer interativo
- ✅ Consumer em tempo real
- ✅ Visualização de mensagens
- ✅ Estatísticas por tópico

## 📊 Estrutura dos Tópicos

### pedidos
```json
{
  "tipo": "pedido",
  "id": "123",
  "cliente": "João Silva",
  "valor": 150.00,
  "itens": ["item1", "item2"],
  "timestamp": "2025-12-20T..."
}
```

### pagamentos
```json
{
  "tipo": "pagamento",
  "id": "456",
  "pedidoId": "123",
  "valor": 150.00,
  "metodo": "cartao",
  "status": "aprovado",
  "timestamp": "2025-12-20T..."
}
```

### notificacoes
```json
{
  "tipo": "notificacao",
  "id": "789",
  "usuario": "teste",
  "titulo": "Pedido confirmado",
  "mensagem": "Seu pedido foi confirmado",
  "timestamp": "2025-12-20T..."
}
```

### logs
```json
{
  "tipo": "log",
  "nivel": "info",
  "mensagem": "Pedido processado",
  "contexto": {...},
  "timestamp": "2025-12-20T..."
}
```

## 🔧 APIs Disponíveis

### Status
```bash
GET /api/kafka/status
```

### Enviar Mensagem (Genérico)
```bash
POST /api/kafka/produce
{
  "topic": "pedidos",
  "message": { ... },
  "key": "optional-key"
}
```

### Enviar para Tópicos Específicos
```bash
POST /api/kafka/pedidos
POST /api/kafka/pagamentos
POST /api/kafka/notificacoes
POST /api/kafka/logs
```

### Listar Mensagens
```bash
GET /api/kafka/messages
GET /api/kafka/messages/pedidos
```

## 🧪 Como Testar

### 1. Acessar Interface Web
```
http://apibolsa.apps-crc.testing/kafka
```
- Login: teste / teste
- Enviar mensagens via Producer
- Ver mensagens chegando via Consumer

### 2. Via API
```bash
ROUTE=$(oc get route -n apibolsa -o jsonpath='{.items[0].spec.host}')

# Login
curl -X POST http://$ROUTE/api/login \
  -H "Content-Type: application/json" \
  -d '{"username":"teste","password":"teste"}' \
  -c cookies.txt

# Enviar pedido
curl -X POST http://$ROUTE/api/kafka/pedidos \
  -H "Content-Type: application/json" \
  -b cookies.txt \
  -d '{
    "id": "123",
    "cliente": "João Silva",
    "valor": 150.00
  }'
```

## 📚 Conceitos Aprendidos

### Producer
- **O que é**: Envia mensagens para tópicos
- **Quando usar**: Quando você quer publicar eventos
- **Exemplo**: Criar pedido → enviar para "pedidos"

### Consumer
- **O que é**: Lê mensagens de tópicos
- **Quando usar**: Quando você quer processar eventos
- **Exemplo**: Ler de "pedidos" → processar → enviar para "pagamentos"

### Tópico (Topic)
- **O que é**: Categoria de mensagens
- **Analogia**: Como uma fila ou canal
- **Exemplo**: "pedidos", "pagamentos"

### Partição
- **O que é**: Divisão do tópico
- **Benefício**: Paralelismo
- **Configuração**: 3 partições por tópico

### Consumer Group
- **O que é**: Grupo de consumers
- **Benefício**: Balanceamento de carga
- **Exemplo**: 3 consumers → cada um processa 1 partição

## 📁 Arquivos Criados

```
kafka/
├── kafka-cluster.yaml      # Cluster Kafka
├── kafka-topics.yaml       # 4 tópicos
├── deploy-kafka.sh        # Script de deploy
├── README.md              # Documentação
└── STATUS.md              # Status atual

nodejs/
├── kafka-producer.js      # Producer
├── kafka-consumer.js      # Consumer
└── public/
    └── kafka.html         # Interface web
```

## ⏳ Próximos Passos

1. Aguardar Kafka ficar totalmente pronto
2. Testar envio de mensagens
3. Verificar consumo em tempo real
4. Explorar funcionalidades avançadas

## 🎯 Status Final

- ✅ Kafka Cluster: Criado
- ✅ 4 Tópicos: Criados
- ✅ Producer: Implementado
- ✅ Consumer: Implementado
- ✅ Interface Web: Criada
- ⏳ Aguardando: Kafka ficar pronto

**Fase 2 concluída!** 🎉



