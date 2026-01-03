# 🔧 Como Ajustar o Kafka - Replication Factor

## 📋 Problema

O Kafka está tentando criar o tópico `__consumer_offsets` com **replication factor 3**, mas só há **1 broker disponível**. Isso causa o erro:

```
The group coordinator is not available
```

## ✅ Soluções

### Opção 1: Configurar Kafka para usar Replication Factor 1 (Recomendado para Ambiente de Desenvolvimento)

#### Passo 1: Verificar configuração atual do Kafka

```bash
# Verificar o Kafka CR (Custom Resource)
oc get kafka -n kafka

# Ver detalhes do Kafka
oc get kafka -n kafka -o yaml | grep -A 10 "replicas\|replication"
```

#### Passo 2: Editar configuração do Kafka

```bash
# Editar o Kafka CR
oc edit kafka -n kafka
```

Ou criar/atualizar um arquivo de configuração:

```yaml
apiVersion: kafka.strimzi.io/v1beta2
kind: Kafka
metadata:
  name: kafka-lab
  namespace: kafka
spec:
  kafka:
    replicas: 1  # Manter 1 broker
    config:
      # Configurar replication factor padrão para 1
      default.replication.factor: "1"
      offsets.topic.replication.factor: "1"
      transaction.state.log.replication.factor: "1"
      # Outras configurações...
```

#### Passo 3: Aplicar configuração

```bash
# Se você criou um arquivo YAML
oc apply -f kafka-config.yaml -n kafka

# Ou se editou diretamente, salvar e sair do editor
```

#### Passo 4: Aguardar Kafka reiniciar

```bash
# Verificar status
oc get pods -n kafka -l strimzi.io/kind=Kafka

# Aguardar pods ficarem prontos
oc wait --for=condition=ready pod -n kafka -l strimzi.io/kind=Kafka --timeout=300s
```

#### Passo 5: Deletar tópico __consumer_offsets existente (se necessário)

```bash
# Acessar pod do Kafka
KAFKA_POD=$(oc get pods -n kafka -l strimzi.io/kind=Kafka -o jsonpath='{.items[0].metadata.name}')

# Deletar tópico (será recriado automaticamente com novo replication factor)
oc exec -n kafka $KAFKA_POD -- /bin/sh -c \
  "kafka-topics.sh --bootstrap-server localhost:9092 --delete --topic __consumer_offsets" || \
  echo "Tópico será recriado automaticamente"
```

---

### Opção 2: Adicionar Mais Brokers ao Kafka

Se você quiser manter replication factor 3, precisa adicionar mais brokers:

#### Passo 1: Editar Kafka CR para aumentar replicas

```bash
oc edit kafka -n kafka
```

Alterar:
```yaml
spec:
  kafka:
    replicas: 3  # Aumentar de 1 para 3
```

#### Passo 2: Aplicar e aguardar

```bash
# Aguardar novos brokers iniciarem
oc get pods -n kafka -w
```

**Nota:** Isso requer mais recursos (CPU/Memória) no cluster.

---

### Opção 3: Criar Tópico __consumer_offsets Manualmente com Replication Factor 1

#### Passo 1: Acessar pod do Kafka

```bash
KAFKA_POD=$(oc get pods -n kafka -l strimzi.io/kind=Kafka -o jsonpath='{.items[0].metadata.name}')
oc exec -it -n kafka $KAFKA_POD -- /bin/sh
```

#### Passo 2: Criar tópico manualmente

```bash
# Dentro do pod
kafka-topics.sh --bootstrap-server localhost:9092 \
  --create \
  --topic __consumer_offsets \
  --partitions 50 \
  --replication-factor 1 \
  --config cleanup.policy=compact \
  --config segment.bytes=104857600
```

#### Passo 3: Verificar tópico criado

```bash
kafka-topics.sh --bootstrap-server localhost:9092 --list | grep consumer
kafka-topics.sh --bootstrap-server localhost:9092 --describe --topic __consumer_offsets
```

---

### Opção 4: Usar KafkaTopic CR para Configurar Tópicos

#### Passo 1: Criar KafkaTopic CR

```yaml
apiVersion: kafka.strimzi.io/v1beta2
kind: KafkaTopic
metadata:
  name: __consumer_offsets
  namespace: kafka
  labels:
    strimzi.io/cluster: kafka-lab
spec:
  partitions: 50
  replicas: 1  # Usar replication factor 1
  config:
    cleanup.policy: compact
    segment.bytes: 104857600
```

#### Passo 2: Aplicar

```bash
oc apply -f kafka-topic-consumer-offsets.yaml -n kafka
```

---

## 🔍 Verificar se Funcionou

### 1. Verificar logs do Kafka

```bash
oc logs -n kafka -l strimzi.io/kind=Kafka --tail=50 | grep -i "consumer_offsets\|replication"
```

### 2. Verificar logs do Node.js

```bash
oc logs -n apibolsa -l app.kubernetes.io/name=nodejs --tail=50 | grep -i kafka
```

**Sucesso:** Não deve mais aparecer "The group coordinator is not available"

### 3. Testar consumer

```bash
# Verificar consumers ativos
oc exec -n apibolsa $(oc get pods -n apibolsa -l app.kubernetes.io/name=nodejs -o jsonpath='{.items[0].metadata.name}') -- \
  node -e "const kafka = require('./kafka-consumer'); console.log(kafka.getActiveConsumers());"
```

---

## 📝 Solução Rápida (Recomendada)

Para resolver rapidamente, use a **Opção 1**:

```bash
# 1. Editar Kafka CR
oc edit kafka -n kafka

# 2. Adicionar/atualizar estas linhas no spec.kafka.config:
default.replication.factor: "1"
offsets.topic.replication.factor: "1"
transaction.state.log.replication.factor: "1"

# 3. Salvar e sair

# 4. Aguardar Kafka reiniciar
oc wait --for=condition=ready pod -n kafka -l strimzi.io/kind=Kafka --timeout=300s

# 5. Reiniciar pod do Node.js para reconectar
oc rollout restart deployment/nodejs -n apibolsa
```

---

## ⚠️ Notas Importantes

1. **Replication Factor 1** é adequado para ambientes de desenvolvimento/teste
2. **Replication Factor 3** é recomendado para produção (requer 3+ brokers)
3. O tópico `__consumer_offsets` é criado automaticamente quando necessário
4. Após ajustar, pode ser necessário reiniciar os consumers

---

## 🆘 Se Ainda Não Funcionar

1. Verificar se o Kafka está realmente rodando:
   ```bash
   oc get pods -n kafka
   ```

2. Verificar conectividade:
   ```bash
   oc exec -n apibolsa <pod-nodejs> -- nc -zv kafka-lab-kafka-bootstrap.kafka.svc.cluster.local 9092
   ```

3. Verificar configuração do Kafka:
   ```bash
   oc get kafka -n kafka -o yaml | grep -A 20 "config:"
   ```

4. Executar diagnóstico completo:
   ```bash
   cd /home/ioliveira/Documentos/sei-ia/healthchecker/apibolsa
   ./diagnosticar-kafka.sh
   ```



