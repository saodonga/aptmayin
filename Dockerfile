FROM node:18-alpine

WORKDIR /app

# 1. Cài đặt các thư viện hệ thống cần thiết (ví dụ: cups-client)
RUN apk add --no-cache cups-client libc6-compat

# 2. Sao chép thông tin dependencies
COPY package.json package-lock.json ./

# 3. Cài đặt các thư viện Node.js
RUN npm ci

# 4. Sao chép Prisma Schema và khởi tạo Client
COPY prisma ./prisma/
RUN npx prisma generate

# 5. Sao chép toàn bộ mã nguồn ứng dụng
COPY . .

# 6. Tắt telemetry và Build ứng dụng Next.js
ENV NEXT_TELEMETRY_DISABLED 1
ENV DATABASE_URL="postgresql://dummy:dummy@localhost:5432/dummy"
ENV NEXTAUTH_SECRET="dummy_secret_for_build"
RUN npm run build

# 7. Expose cổng chạy ứng dụng
EXPOSE 3000

# 8. Chạy ứng dụng Next.js ở chế độ Production
CMD ["npm", "run", "start"]
