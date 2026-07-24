FROM node:20-alpine

WORKDIR /app

# 1. Cài đặt các thư viện hệ thống cần thiết
#    - cups-client      : giao tiếp với CUPS server
#    - libc6-compat     : tương thích glibc cho Node native modules
#    - fontconfig       : quản lý font hệ thống
#    - font-noto        : Noto Sans/Serif — hỗ trợ Unicode đầy đủ, bao gồm tiếng Việt (UTF-8)
#    - font-noto-extra  : bộ glyph bổ sung cho các ký tự Latin Extended (có dấu Việt)
RUN apk add --no-cache \
    cups-client \
    libc6-compat \
    fontconfig \
    font-noto \
    font-noto-extra \
  && fc-cache -f -v

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
EXPOSE 3500

# 8. Chạy ứng dụng Next.js ở chế độ Production
CMD ["npm", "run", "start"]
