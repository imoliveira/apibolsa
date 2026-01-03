# 🚀 Acesso Rápido - Console Kafka

## ✅ Kafka UI Instalado!

### 🌐 Acessar Agora

```
https://kafka-ui-kafka.apps-crc.testing
```

**Status**: ✅ Running e pronto para uso!

---

## 📋 O que você pode fazer:

1. **Ver Tópicos**
   - Lista todos os tópicos (pedidos, pagamentos, notificacoes, logs)
   - Ver detalhes de cada tópico (partições, replicação, etc.)

2. **Ver Mensagens**
   - Ver mensagens em tempo real
   - Filtrar por tópico
   - Ver offset, partition, timestamp

3. **Enviar Mensagens**
   - Producer integrado
   - Enviar JSON diretamente

4. **Ver Consumers**
   - Grupos de consumidores
   - Lag e offsets
   - Status dos consumers

5. **Estatísticas**
   - Throughput
   - Latência
   - Tamanho dos tópicos

---

## 🔧 Comandos Úteis

### Ver Status
```bash
oc get pods -l app=kafka-ui -n kafka
oc get route kafka-ui -n kafka
```

### Ver Logs
```bash
oc logs -l app=kafka-ui -n kafka --tail=20
```

### Reiniciar (se necessário)
```bash
oc delete pod -l app=kafka-ui -n kafka
```

---

## 🎯 Outras Formas de Acesso

### 1. Interface Web do Node.js (já existe)
```bash
ROUTE=$(oc get route -n apibolsa -o jsonpath='{.items[0].spec.host}')
echo "http://$ROUTE/kafka"
```
Login: `teste` / `teste`

### 2. Port Forward
```bash
oc port-forward svc/kafka-ui -n kafka 8080:8080
# Acesse: http://localhost:8080
```

### 3. Linha de Comando
```bash
# Listar tópicos
oc run kafka-tools -it --rm --image=quay.io/strimzi/kafka:latest-kafka-3.6.0 \
  -- bin/kafka-topics.sh \
  --bootstrap-server kafka-lab-kafka-bootstrap:9092 \
  --list
```

---

## ✅ Resumo

**Kafka UI (Recomendado)**: https://kafka-ui-kafka.apps-crc.testing

**Interface Node.js**: http://apibolsa.apps-crc.testing/kafka

**Bootstrap Server**: `kafka-lab-kafka-bootstrap.kafka.svc.cluster.local:9092`


