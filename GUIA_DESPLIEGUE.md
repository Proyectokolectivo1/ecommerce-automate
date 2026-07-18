# Guía de Despliegue y Configuración — Paso a Paso

> **Documento completo para llevar la plataforma a producción en Oracle Cloud.**
> Incluye: VM, Docker, credenciales de APIs, webhooks y todo lo pendiente.

---

## RESUMEN EJECUTIVO

La plataforma está **100% code-ready** para desplegar. Lo que falta es
configuración **externa** (infraestructura + credenciales de terceros).
Esta guía te lleva paso a paso por todo.

**Tiempo estimado total:** 4-6 horas
**Costo mensual estimado:** ~USD 35 (VM) + servicios externos

---

## FASE 1: Infraestructura en Oracle Cloud (1-2 horas)

### 1.1 Crear cuenta en Oracle Cloud
1. Ve a https://cloud.oracle.com → "Start for free"
2. Completa el registro (pide tarjeta pero no cobra en tier gratuito)
3. El tier gratuito (Always Free) incluye:
   - 1 VM AMD (1/8 OCPU, 1GB RAM) — **insuficiente**
   - 1 VM Arm (4 OCPU, 24GB RAM) — **recomendada, gratis**
   - 200GB block storage
   - 10GB Object Storage

### 1.2 Crear VM Arm (Ampere A1)
1. Console → Compute → Instances → Create Instance
2. Configuración:
   - **Shape:** VM.Standard.A1.Flex (Arm)
   - **OCPUs:** 4
   - **Memory:** 24 GB
   - **OS:** Ubuntu 22.04 LTS (Canonical Ubuntu)
   - **SSH Key:** Genera nueva o sube tu pública
3. Anota la **IP pública** de la VM
4. Configura el firewall (Security List):
   - Puerto 22 (SSH)
   - Puerto 80 (HTTP)
   - Puerto 443 (HTTPS)

### 1.3 Conectarse por SSH
```bash
ssh -i tu-llave-privada ubuntu@IP_DE_TU_VM
```

### 1.4 Instalar Docker en la VM
```bash
# Actualizar sistema
sudo apt update && sudo apt upgrade -y

# Instalar Docker
curl -fsSL https://get.docker.com | sudo sh

# Añadir usuario al grupo docker
sudo usermod -aG docker $USER

# Instalar Docker Compose
sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose

# Cerrar sesión y volver a entrar
exit
ssh -i tu-llave-privada ubuntu@IP_DE_TU_VM

# Verificar
docker --version
docker-compose --version
```

### 1.5 Configurar firewall de Ubuntu
```bash
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw --force enable
```

### 1.6 Instalar fail2ban (seguridad)
```bash
sudo apt install fail2ban -y
sudo systemctl enable fail2ban
sudo systemctl start fail2ban
```

---

## FASE 2: Desplegar la Aplicación (30 min)

### 2.1 Clonar el repositorio
```bash
cd /home/ubuntu
git clone https://github.com/Proyectokolectivo1/ecommerce-automate.git
cd ecommerce-automate
```

### 2.2 Migrar a PostgreSQL
```bash
# Cambiar schema a PostgreSQL
cp prisma/schema.postgres.prisma prisma/schema.prisma
```

### 2.3 Configurar .env de producción
```bash
cp .env.example .env
nano .env
```

Edita con estos valores:
```env
# PostgreSQL (se conecta al contenedor de Docker)
DATABASE_URL=postgresql://ecommerce:TU_PASSWORD_SEGURA@postgres:5432/ecommerce

# NextAuth — generar secret aleatorio
NEXTAUTH_SECRET=$(openssl rand -base64 32)
NEXTAUTH_URL=https://tu-dominio.com

# Redis
REDIS_URL=redis://:TU_REDIS_PASSWORD@redis:6379

# Realtime
REALTIME_URL=http://realtime:3003/emit
REALTIME_SECRET=TU_REALTIME_SECRET

# Oracle Cloud Object Storage
ORACLE_CLOUD_NAMESPACE=tu-namespace
ORACLE_CLOUD_REGION=us-ashburn-1
ORACLE_CLOUD_BUCKET=ecommerce-automate
ORACLE_CLOUD_ACCESS_KEY=tu-access-key
ORACLE_CLOUD_SECRET_KEY=tu-secret-key
```

### 2.4 Configurar passwords de Docker
```bash
# Crear archivo .env para docker-compose
cat > .env.docker << 'EOF'
POSTGRES_DB=ecommerce
POSTGRES_USER=ecommerce
POSTGRES_PASSWORD=TU_PASSWORD_SEGURA
REDIS_PASSWORD=TU_REDIS_PASSWORD
NEXTAUTH_SECRET=TU_NEXTAUTH_SECRET
NEXTAUTH_URL=https://tu-dominio.com
REALTIME_SECRET=TU_REALTIME_SECRET
EOF
```

### 2.5 Levantar todo con Docker
```bash
docker-compose -f docker-compose.prod.yml up -d --build
```

### 2.6 Crear base de datos y sembrar datos
```bash
# Esperar a que PostgreSQL esté listo (30s)
sleep 30

# Crear tablas
docker-compose -f docker-compose.prod.yml exec app bun run db:push

# Sembrar datos demo
docker-compose -f docker-compose.prod.yml exec app bun run db:seed
```

### 2.7 Verificar
```bash
# Health check
curl http://localhost:3000/api/system/health

# Debe responder:
# {"status":"ok","database":"ok",...}
```

---

## FASE 3: Configurar Dominio y TLS (30 min)

### 3.1 Apuntar dominio
1. Ve a tu proveedor de dominio (GoDaddy, Namecheap, etc.)
2. Crea un registro A:
   - **Host:** @ (o el subdominio que prefieras)
   - **Value:** IP pública de tu VM
   - **TTL:** 300

### 3.2 Instalar Caddy (reverse proxy con TLS automático)
```bash
# Instalar Caddy
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update
sudo apt install caddy -y
```

### 3.3 Configurar Caddy
```bash
sudo nano /etc/caddy/Caddyfile
```

Contenido:
```
tu-dominio.com {
    reverse_proxy localhost:3000
}

# Realtime (socket.io) — opcional si necesitas websockets
ws.tu-dominio.com {
    reverse_proxy localhost:3003
}
```

```bash
# Reiniciar Caddy
sudo systemctl restart caddy
sudo systemctl enable caddy
```

Caddy obtiene certificados TLS automáticamente.

### 3.4 Verificar
```bash
curl https://tu-dominio.com/api/system/health
```

---

## FASE 4: Configurar Oracle Cloud Object Storage (30 min)

### 4.1 Crear bucket
1. Oracle Cloud Console → Object Storage → Create Bucket
2. Nombre: `ecommerce-automate`
3. Anota el **namespace** (aparece arriba)
4. Región: la misma de tu VM

### 4.2 Crear API Keys
1. Identity → Users → tu usuario → API Keys → Add API Key
2. Selecciona "Generate API Key Pair"
3. Descarga la private key
4. Anota:
   - **Access Key** (empieza con `ak...`)
   - **Secret Key** (empieza con `sj...`)

### 4.3 Configurar en la VM
```bash
# Editar .env.docker
nano .env.docker

# Añadir:
ORACLE_CLOUD_NAMESPACE=tu-namespace
ORACLE_CLOUD_REGION=tu-region
ORACLE_CLOUD_BUCKET=ecommerce-automate
ORACLE_CLOUD_ACCESS_KEY=ak...
ORACLE_CLOUD_SECRET_KEY=sj...

# Reiniciar la app
docker-compose -f docker-compose.prod.yml up -d
```

---

## FASE 5: Integrar Shopify (1 hora)

### 5.1 Crear Shopify App
1. Ve a https://partners.shopify.com → "Apps" → "Create app"
2. Tipo: **Custom app**
3. Selecciona tu tienda
4. Configura permisos de API:
   - `read_orders`, `write_orders`
   - `read_products`, `write_products`
   - `read_inventory`, `write_inventory`
   - `write_fulfillments`
   - `read_customers`

### 5.2 Obtener credenciales
Anota:
- **Shop domain:** `mi-tienda.myshopify.com`
- **Admin API access token:** `shpat_...`
- **API secret key:** `shpss_...`
- **API key:** `shpa_...`

### 5.3 Configurar en la plataforma
1. Entra a `https://tu-dominio.com` → login con admin@demo.com
2. Ve a **Configuración → Integraciones → Proveedores**
3. Haz clic en **Configurar** (Shopify)
4. Completa:
   - Shop: `mi-tienda.myshopify.com`
   - Access Token: `shpat_...`
   - API Secret: `shpss_...`
   - API Key: `shpa_...`
5. Guarda y activa

### 5.4 Configurar webhooks en Shopify
En Shopify Admin → Settings → Notifications → Webhooks:
```
 orders/create    → https://tu-dominio.com/api/webhooks/shopify
 orders/updated   → https://tu-dominio.com/api/webhooks/shopify
 orders/cancelled → https://tu-dominio.com/api/webhooks/shopify
 orders/paid      → https://tu-dominio.com/api/webhooks/shopify
 fulfillment/create → https://tu-dominio.com/api/webhooks/shopify
```

### 5.5 Verificar
- Haz un pedido de prueba en Shopify
- Revisa en la plataforma: **Integraciones → Webhooks**
- Debe aparecer el webhook recibido con status PROCESSED

---

## FASE 6: Integrar Wompi (pago transporte COD) (45 min)

### 6.1 Crear cuenta en Wompi
1. Ve a https://wompi.co → registrate
2. Modo sandbox primero para pruebas: https://sandbox.wompi.co
3. Anota:
   - **Public key:** `pub_test_...`
   - **Private key:** `prv_test_...`
   - **Integrity secret:** `intsec_test_...`
   - **Event hash secret** (para webhooks)

### 6.2 Configurar en la plataforma
1. **Integraciones → Configurar (Wompi)**
2. Completa:
   - Public Key: `pub_test_...`
   - Private Key: `prv_test_...`
   - Integrity Secret: `intsec_test_...`
   - Modo sandbox: ON (para pruebas)
3. Guarda y activa
4. Haz clic en **Probar** para verificar conexión

### 6.3 Configurar webhook en Wompi
En Wompi Dashboard → Configuración → Webhooks:
```
URL: https://tu-dominio.com/api/webhooks/payments
Eventos: transaction.updated
```

### 6.4 Probar flujo COD completo
1. Crea un pedido COD en Shopify
2. La plataforma recibe el webhook → estado PENDIENTE_PAGO_TRANSPORTE
3. Se genera un link de pago Wompi automáticamente
4. El cliente paga → Wompi envía webhook
5. La plataforma confirma → estado PAGO_TRANSPORTE_CONFIRMADO
6. Revisa en: **Integraciones → Webhooks** (debe haber 2 entradas PROCESSED)

---

## FASE 7: Integrar WhatsApp Cloud API (30 min)

### 7.1 Crear app en Meta for Developers
1. Ve a https://developers.facebook.com
2. My Apps → Create App → Business
3. Añade producto: **WhatsApp**
4. Anota:
   - **Phone Number ID:** `123456789...`
   - **Access Token:** `EAAJ...`

### 7.2 Configurar plantillas de WhatsApp
Necesitas crear estas plantillas en Meta:
- `pago_transporte` — con 4 variables: nombre, pedido, monto, link
- `guia_generada` — con 4 variables: nombre, pedido, guía, transportadora

Aprobarlas (tarda 24-48h en revisión).

### 7.3 Configurar webhook de WhatsApp (opcional)
```
GET  https://tu-dominio.com/api/webhooks/whatsapp  (verificación)
POST https://tu-dominio.com/api/webhooks/whatsapp  (mensajes)
```

### 7.4 Configurar en la plataforma
1. **Integraciones → Configurar (WhatsApp)**
2. Completa:
   - Phone Number ID: `123456789...`
   - Access Token: `EAAJ...`
   - Template Name: `pago_transporte`
3. Guarda y activa

---

## FASE 8: Integrar Mastershop (1 hora)

### 8.1 Obtener credenciales
Contacta a Mastershop para obtener:
- **API URL:** `https://api.mastershop.com` (o la que provean)
- **API Key:** tu key
- **Merchant ID:** tu ID
- **Default carrier:** SERVIENTREGA (o la transportadora preferida)

### 8.2 Configurar en la plataforma
1. **Integraciones → Configurar (Mastershop)**
2. Completa:
   - API URL
   - API Key
   - Merchant ID
   - Default Carrier
3. Guarda y activa

### 8.3 Configurar webhook de Mastershop
Si Mastershop soporta webhooks de tracking:
```
URL: https://tu-dominio.com/api/webhooks/mastershop
```

### 8.4 Probar flujo completo
1. Despacha un pedido desde la plataforma
2. Se crea el despacho en Mastershop → se genera la guía
3. La guía se imprime automáticamente
4. Se envía WhatsApp + Email al cliente
5. Mastershop notifica tracking → se actualiza el estado

---

## FASE 9: Configurar Email (15 min)

### 9.1 Crear cuenta en Resend
1. Ve a https://resend.com → registrate (gratis hasta 3000 emails/mes)
2. Verifica tu dominio
3. Anota:
   - **API Key:** `re_...`
   - **From address:** `no-reply@tudominio.com`

### 9.2 Configurar en la plataforma
1. **Integraciones → Configurar (Email)**
2. Completa:
   - Provider: resend
   - API Key: `re_...`
   - From Address: `no-reply@tudominio.com`
   - From Name: Ecommerce
3. Guarda y activa

---

## FASE 10: Configurar Impresión (30 min)

### 10.1 Instalar CUPS en la VM (si tienes impresora USB conectada)
```bash
sudo apt install cups -y
sudo usermod -aG lpadmin $USER
sudo systemctl enable cups
sudo systemctl start cups
```

### 10.2 Configurar impresora
```bash
# Listar impresoras
lpstat -p

# La app usa el comando `lp` automáticamente si CUPS está disponible
```

### 10.3 Verificar
1. Despacha un pedido
2. La guía se envía a la impresora automáticamente
3. Revisa en: **Impresión de Guías** → debe aparecer PRINTED

---

## FASE 11: Configurar Backups (15 min)

### 11.1 Script de backup automático
```bash
# Crear script
sudo nano /home/ubuntu/backup.sh
```

```bash
#!/bin/bash
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR=/home/ubuntu/backups
mkdir -p $BACKUP_DIR

# Backup PostgreSQL
docker-compose -f /home/ubuntu/ecommerce-automate/docker-compose.prod.yml exec -T postgres pg_dump -U ecommerce ecommerce > $BACKUP_DIR/db_$DATE.sql

# Mantener solo últimos 30 días
find $BACKUP_DIR -name "db_*.sql" -mtime +30 -delete

echo "Backup completado: db_$DATE.sql"
```

```bash
# Hacer ejecutable
chmod +x /home/ubuntu/backup.sh

# Programar diario a las 3am
crontab -e
# Añadir:
0 3 * * * /home/ubuntu/backup.sh >> /home/ubuntu/backup.log 2>&1
```

---

## FASE 12: Verificación Final (30 min)

### 12.1 Checklist completo
- [ ] VM creada en Oracle Cloud
- [ ] Docker instalado
- [ ] App desplegada con docker-compose
- [ ] Dominio apuntando a la VM
- [ ] TLS configurado con Caddy
- [ ] Health check responde OK
- [ ] Oracle Cloud Storage configurado
- [ ] Shopify webhook configurado y probado
- [ ] Wompi configurado y probado
- [ ] WhatsApp Cloud API configurado
- [ ] Mastershop configurado
- [ ] Email (Resend) configurado
- [ ] Impresión funcionando
- [ ] Backups programados

### 12.2 Flujo end-to-end de prueba
1. **Crear pedido en Shopify** (COD)
2. Verificar: llega a la plataforma → estado PENDIENTE_PAGO_TRANSPORTE
3. Verificar: link de pago Wompi generado
4. Verificar: WhatsApp enviado al cliente
5. **Pagar el transporte** (link Wompi sandbox)
6. Verificar: webhook de Wompi recibido → estado PAGO_TRANSPORTE_CONFIRMADO
7. **Despachar** desde la plataforma
8. Verificar: guía generada → impresa → Shopify actualizado
9. Verificar: WhatsApp + Email con guía enviados al cliente
10. **Simular entrega** (webhook Mastershop DELIVERED)
11. Verificar: estado ENTREGADO → venta reconocida en dashboard

### 12.3 Monitoreo
```bash
# Ver logs de la app
docker-compose -f docker-compose.prod.yml logs -f app

# Ver logs de PostgreSQL
docker-compose -f docker-compose.prod.yml logs -f postgres

# Ver health check
curl https://tu-dominio.com/api/system/health

# Ver estado de Docker
docker-compose -f docker-compose.prod.yml ps
```

---

## CREDENCIALES DEMO (desarrollo local)

| Rol | Email | Contraseña |
|-----|-------|------------|
| ADMIN | admin@demo.com | admin123 |
| GERENCIA | gerencia@demo.com | gerencia123 |
| BODEGA | bodega@demo.com | bodega123 |
| SERVICIO | servicio@demo.com | servicio123 |

## SERVICIOS EXTERNOS — Resumen de costos

| Servicio | Costo inicial | Costo mensual |
|----------|:---:|:---:|
| Oracle Cloud VM (Arm 4OCPU 24GB) | Gratis (Always Free) | $0 |
| Dominio | ~$10/año | ~$1 |
| Wompi | Gratis (sandbox) | Comisión por transacción |
| WhatsApp Cloud API | Gratis (1000 conversaciones/mes) | $0.025/conversación extra |
| Resend (email) | Gratis (3000/mes) | $20/mes (50k) |
| Shopify | Tu plan actual | — |
| Mastershop | Tu contrato | — |
| **Total estimado** | ~$10 | **~$35/mes** |

---

*Documento generado para despliegue en producción.*
*Mantener actualizado después de cada cambio de infraestructura.*
