#!/bin/bash
VAULT_CLIENT_SLEEP=${VAULT_CLIENT_SLEEP:-15}

sleep $VAULT_CLIENT_SLEEP
# internal docker host name
export VAULT_ADDR="http://${VAULT_HOST}:8200"
export VAULT_KEY_FILE=/data/keys/keys.txt
export VAULT_ROOT_TOKEN_FILE=/data/keys/root.txt

vault status -address=${VAULT_ADDR}

if [ ! -f "$VAULT_KEY_FILE" ]; then
    echo "start the vault and save key to keys.txt file"
    vault operator init -address=${VAULT_ADDR} > $VAULT_KEY_FILE
fi

echo "unseal the vault"
KEY_1=$(grep 'Key 1:' ${VAULT_KEY_FILE} | awk '{print $NF}')
KEY_2=$(grep 'Key 2:' ${VAULT_KEY_FILE} | awk '{print $NF}')
KEY_3=$(grep 'Key 3:' ${VAULT_KEY_FILE} | awk '{print $NF}')
echo "KEY 1 $KEY_1"
echo "KEY 2 $KEY_2"

vault operator unseal -address=${VAULT_ADDR} ${KEY_1}
vault operator unseal -address=${VAULT_ADDR} ${KEY_2}
vault operator unseal -address=${VAULT_ADDR} ${KEY_3}

echo "export the vault token"
export VAULT_TOKEN=$(grep 'Initial Root Token:' ${VAULT_KEY_FILE} | awk '{print $NF}')

if [ ! -f "$VAULT_ROOT_TOKEN_FILE" ]; then
    echo "$VAULT_TOKEN" > $VAULT_ROOT_TOKEN_FILE
fi

echo "check the status"
vault status -address=${VAULT_ADDR}

echo "auth the vault using token"
vault auth -address=${VAULT_ADDR} ${VAULT_TOKEN}