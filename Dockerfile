# Gunakan image Node.js versi LTS
FROM node:18-alpine

# Buat direktori aplikasi
WORKDIR /usr/src/app

# Install dependensi build yang diperlukan
RUN apk add --no-cache --virtual .gyp python3 make g++

# Salin package.json dan package-lock.json
COPY package*.json ./

# Install dependencies
RUN npm install --production

# Salin seluruh kode aplikasi
COPY . .

# Port yang digunakan aplikasi
EXPOSE 3001

# Perintah untuk menjalankan aplikasi
CMD [ "node", "app.js" ]
