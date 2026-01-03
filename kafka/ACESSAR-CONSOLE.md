# 🎯 Como Acessar a Console do Kafka

## 🚀 Método 1: Kafka UI (Interface Web) - RECOMENDADO

### Instalar Kafka UI

```bash
# Aplicar o deployment
oc apply -f /home/ioliveira/Documentos/sei-ia/healthchecker/apibolsa/kafka/kafka-ui.yaml

# Aguardar o pod ficar pronto
oc wait --for=condition=ready pod -l app=kafka-ui -n kafka --timeout=120s

# Obter a URL
oc get route kafka-ui -n kafka -o jsonpath='{.spec.host}'
```

### Acessar

Após instalar, acesse:
```
https://kafka-ui-kafka.apps-crc.testing
```

**Funcionalidades**:
- ✅ Ver todos os tópicos
- ✅ Ver mensagens em tempo real
- ✅ Enviar mensagens
- ✅ Ver consumers e grupos
- ✅ Ver partições e offsets
- ✅ Estatísticas detalhadas

---

## 🔧 Método 2: Port Forward (Acesso Direto)

### Port Forward do Kafka Bootstrap

```bash
# Port forward do Kafka
oc port-forward svc/kafka-lab-kafka-bootstrap -n kafka 9092:9092

# Em outro terminal, usar ferramentas Kafka
# Exemplo: kafka-console-producer
oc run kafka-producer -it --rm --image=quay.io/strimzi/kafka:latest-kafka-3.6.0 \
  -- bin/kafka-console-producer.sh \
  --bootstrap-server localhost:9092 \
  --topic pedidos
```

### Port Forward do Kafka UI (se instalado)

```bash
oc port-forward svc/kafka-ui -n kafka 8080:8080
```

Acesse: `http://localhost:8080`

---

## 🛠️ Método 3: Ferramentas de Linha de Comando

### Listar Tópicos

```bash
oc run kafka-tools -it --rm --image=quay.io/strimzi/kafka:latest-kafka-3.6.0 \
  -- bin/kafka-topics.sh \
  --bootstrap-server kafka-lab-kafka-bootstrap:9092 \
  --list
```

### Ver Detalhes de um Tópico

```bash
oc run kafka-tools -it --rm --image=quay.io/strimzi/kafka:latest-kafka-3.6.0 \
  -- bin/kafka-topics.sh \
  --bootstrap-server kafka-lab-kafka-bootstrap:9092 \
  --describe \
  --topic pedidos
```

### Enviar Mensagem (Producer)

```bash
oc run kafka-producer -it --rm --image=quay.io/strimzi/kafka:latest-kafka-3.6.0 \
  -- bin/kafka-console-producer.sh \
  --bootstrap-server kafka-lab-kafka-bootstrap:9092 \
  --topic pedidos
```

Depois digite a mensagem e pressione Enter.

### Consumir Mensagens (Consumer)

```bash
# Consumir do início
oc run kafka-consumer -it --rm --image=quay.io/strimzi/kafka:latest-kafka-3.6.0 \
  -- bin/kafka-console-consumer.sh \
  --bootstrap-server kafka-lab-kafka-bootstrap:9092 \
  --topic pedidos \
  --from-beginning

# Consumir apenas novas mensagens
oc run kafka-consumer -it --rm --image=quay.io/strimzi/kafka:latest-kafka-3.6.0 \
  -- bin/kafka-console-consumer.sh \
  --bootstrap-server kafka-lab-kafka-bootstrap:9092 \
  --topic pedidos
```

### Ver Grupos de Consumidores

```bash
oc run kafka-tools -it --rm --image=quay.io/strimzi/kafka:latest-kafka-3.6.0 \
  -- bin/kafka-consumer-groups.sh \
  --bootstrap-server kafka-lab-kafka-bootstrap:9092 \
  --list
```

### Ver Detalhes de um Grupo

```bash
oc run kafka-tools -it --rm --image=quay.io/strimzi/kafka:latest-kafka-3.6.0 \
  -- bin/kafka-consumer-groups.sh \
  --bootstrap-server kafka-lab-kafka-bootstrap:9092 \
  --describe \
  --group apibolsa-consumer-group
```

---

## 🌐 Método 4: Interface Web do Node.js (Já Existe)

A aplicação Node.js já tem uma interface web para Kafka:

```bash
# Obter URL
ROUTE=$(oc get route -n apibolsa -o jsonpath='{.items[0].spec.host}')
echo "http://$ROUTE/kafka"
```

Acesse e faça login: `teste` / `teste`

**Funcionalidades**:
- ✅ Enviar mensagens (Producer)
- ✅ Ver mensagens recebidas (Consumer)
- ✅ Status dos consumers
- ✅ Estatísticas por tópico

---

## 📊 Comparação dos Métodos

| Método | Facilidade | Funcionalidades | Recomendado Para |
|--------|-----------|-----------------|------------------|
| **Kafka UI** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | Administração completa |
| **Port Forward** | ⭐⭐⭐ | ⭐⭐⭐⭐ | Desenvolvimento local |
| **Linha de Comando** | ⭐⭐ | ⭐⭐⭐⭐⭐ | Automação e scripts |
| **Interface Node.js** | ⭐⭐⭐⭐ | ⭐⭐⭐ | Testes rápidos |

---

## 🚀 Instalação Rápida do Kafka UI

```bash
# 1. Aplicar
oc apply -f /home/ioliveira/Documentos/sei-ia/healthchecker/apibolsa/kafka/kafka-ui.yaml

# 2. Aguardar
oc wait --for=condition=ready pod -l app=kafka-ui -n kafka --timeout=120s

# 3. Obter URL
KAFKA_UI_URL=$(oc get route kafka-ui -n kafka -o jsonpath='{.spec.host}')
echo "✅ Kafka UI disponível em: https://$KAFKA_UI_URL"
```

---

## 🔍 Verificar Status

### Kafka UI

```bash
# Ver pod
oc get pods -l app=kafka-ui -n kafka

# Ver logs
oc logs -l app=kafka-ui -n kafka --tail=20

# Ver route
oc get route kafka-ui -n kafka
```

### Kafka Cluster

```bash
# Ver pods do Kafka
oc get pods -n kafka

# Ver serviços
oc get svc -n kafka | grep kafka

# Ver tópicos
oc get kafkatopic -n kafka
```

---

## 🎯 Exemplo Completo: Usar Kafka UI

```bash
# 1. Instalar
oc apply -f /home/ioliveira/Documentos/sei-ia/healthchecker/apibolsa/kafka/kafka-ui.yaml

# 2. Aguardar
sleep 30

# 3. Acessar
KAFKA_UI_URL=$(oc get route kafka-ui -n kafka -o jsonpath='{.spec.host}')
echo "🌐 Acesse: https://$KAFKA_UI_URL"
```

No navegador:
1. Abra a URL
2. Você verá o cluster `kafka-lab` já configurado
3. Explore tópicos, mensagens, consumers, etc.

---

## ✅ Resumo

**Para acesso rápido e visual:**
```bash
oc apply -f /home/ioliveira/Documentos/sei-ia/healthchecker/apibolsa/kafka/kafka-ui.yaml
# Aguardar ~30 segundos
# Acessar: https://kafka-ui-kafka.apps-crc.testing
```

**Para testes via linha de comando:**
```bash
oc run kafka-tools -it --rm --image=quay.io/strimzi/kafka:latest-kafka-3.6.0 \
  -- bin/kafka-topics.sh \
  --bootstrap-server kafka-lab-kafka-bootstrap:9092 \
  --list
```

**Para interface customizada (já existe):**
```bash
ROUTE=$(oc get route -n apibolsa -o jsonpath='{.items[0].spec.host}')
echo "http://$ROUTE/kafka"
```


