# Hướng dẫn Triển khai Hệ thống (Deployment & Operations Guide)
## Hệ thống Máy in Server Từ xa (Remote Print Server)

Tài liệu này hướng dẫn quản trị viên cách triển khai hệ thống Remote Print Server lên máy chủ Ubuntu Linux bằng Docker Compose.

---

## 1. Yêu cầu Hệ thống (Prerequisites)

*   **Hệ điều hành máy chủ:** Ubuntu Server 20.04 LTS hoặc mới hơn (đã cài sẵn `git`, `docker` và `docker-compose`).
*   **Máy in vật lý (HP 404):** Máy in được kết nối vào cùng mạng nội bộ (mạng LAN) với địa chỉ IP tĩnh là `10.100.0.200`. Máy in phải bật giao thức IPP (Internet Printing Protocol) hoặc raw TCP/JetDirect trên cổng `9100`.
*   **Cơ sở dữ liệu:** Chuỗi kết nối Neon.tech PostgreSQL hợp lệ (đã được cấu hình trong dự án).
*   **Tài khoản Google Cloud Console:** Thiết lập một dự án trên Google Cloud Platform, kích hoạt Google OAuth 2.0 để lấy `Client ID` và `Client Secret` phục vụ xác thực người dùng.

---

## 2. Các Bước Triển khai Chi tiết

### Bước 1: Sao chép Mã nguồn lên Server
SSH vào máy chủ Ubuntu và thực hiện clone dự án về thư mục làm việc:
```bash
git clone https://github.com/saodonga/skillantigravity.git printer-server # Hoặc thư mục chứa code của bạn
cd printer-server
```

### Bước 2: Thiết lập Biến Môi trường
Tạo file `.env` tại thư mục gốc của dự án:
```bash
nano .env
```
Điền đầy đủ thông tin cấu hình thực tế:
```env
# 1. Kết nối cơ sở dữ liệu Neon.tech
DATABASE_URL="postgresql://neondb_owner:YOUR_NEON_PASSWORD@ep-lively-paper-ao605qr8-pooler.c-2.ap-southeast-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require"

# 2. Định nghĩa Admin tối cao (Không thể bị xóa)
ADMIN_EMAILS="admin1@yourdomain.com,admin2@yourdomain.com"

# 3. NextAuth URL (Thay thế bằng domain thực tế của bạn ở production)
NEXTAUTH_URL="http://localhost:3000"
NEXTAUTH_SECRET="e9a94cb22c544d6db8759fb964ee71beea2531cdceadcb256b8253123ab49cd1" # Đổi chuỗi khóa bí mật ngẫu nhiên

# 4. Thông tin Google OAuth 2.0 (Lấy từ Google Cloud Console)
GOOGLE_CLIENT_ID="xxx.apps.googleusercontent.com"
GOOGLE_CLIENT_SECRET="GOCSPX-xxx"

# 5. Cấu hình chế độ in thử (Thay đổi về "false" khi chạy thật với máy in CUPS)
MOCK_PRINTING="false"
```

### Bước 3: Đồng bộ cấu trúc Cơ sở dữ liệu
Nếu triển khai lần đầu tiên, hãy chạy lệnh đồng bộ schema Prisma lên database Neon.tech từ local hoặc server:
```bash
npx prisma db push
```

### Bước 4: Khởi chạy hệ thống bằng Docker Compose
Chạy lệnh sau để build ảnh Docker và khởi động Next.js Web App cùng CUPS Server chạy ngầm:
```bash
docker compose up -d --build
```
Kiểm tra xem các container đã khởi chạy thành công hay chưa:
```bash
docker compose ps
```
*Bạn sẽ thấy hai container `printer_server_app` và `printer_cups_server` đều ở trạng thái Up.*

---

## 3. Cấu hình Máy in HP 404 trên CUPS Server

Vì máy in HP 404 kết nối qua mạng nội bộ IP `10.100.0.200`, ta cần đăng ký máy in này với CUPS Server:

1.  Truy cập giao diện quản trị CUPS thông qua trình duyệt tại địa chỉ: `http://<server-ip>:631`.
2.  Nếu trình duyệt cảnh báo HTTPS, chọn Tiếp tục truy cập.
3.  Vào mục **Administration** -> Click chọn **Add Printer**.
4.  Khi hệ thống yêu cầu tài khoản đăng nhập:
    *   *Username:* `root` (hoặc tài khoản quản trị hệ thống của container).
    *   *Password:* Nhập `admin_secret` (được chỉ định trong biến `ADMIN_PASSWORD` của file `docker-compose.yml`).
5.  Chọn giao thức kết nối: Chọn **AppSocket/HP JetDirect** hoặc **Internet Printing Protocol (ipp)**.
6.  Nhập địa chỉ kết nối:
    *   Nếu dùng JetDirect: `socket://10.100.0.200:9100`
    *   Nếu dùng IPP: `ipp://10.100.0.200/ipp/print`
7.  Đặt tên máy in trên CUPS: Nhập tên viết liền không dấu, ví dụ: `hp_404_office` (ghi nhớ tên này).
8.  Chọn Driver: Chọn hãng **HP** và tìm model **HP LaserJet Pro M404** (hoặc chọn driver chung **Generic PostScript Printer / IPP Everywhere** để tương thích tốt nhất).
9.  Ấn **Add Printer** và thiết lập tùy chọn khổ giấy mặc định là `A4`.

---

## 4. Đăng ký máy in vào Ứng dụng Web

1. Đăng nhập vào trang web chính bằng tài khoản admin (sử dụng email có trong danh sách cấu hình `ADMIN_EMAILS`).
2. Chuyển sang Tab **Quản lý hệ thống**.
3. Điền thông tin vào form **Thêm máy in mới**:
   *   *Tên CUPS:* Điền chính xác tên đã đặt ở Bước 3 (ví dụ: `hp_404_office`).
   *   *Tên hiển thị:* Nhập tên thân thiện (ví dụ: `Máy in HP M404 Trung Tâm`).
   *   *Địa chỉ kết nối:* Điền URL của máy in CUPS nội bộ container: `ipp://cups-server:631/printers/hp_404_office`.
   *   *Vị trí:* Điền vị trí (ví dụ: `Bàn làm việc kế toán`).
   *   Tích chọn hỗ trợ in 2 mặt (Duplex) và in màu (nếu có).
4. Click **Đăng ký máy in**. 

Hệ thống đã sẵn sàng phục vụ in ấn từ xa!

---

## 5. Danh sách kiểm tra khi triển khai (Production Checklist)

*   [ ] Đảm bảo máy chủ Ubuntu và máy in HP 404 (`10.100.0.200`) có thể ping thấy nhau trong mạng nội bộ LAN.
*   [ ] Đã cấu hình đổi `NEXTAUTH_SECRET` sang một chuỗi mã hóa ngẫu nhiên và bảo mật cao.
*   [ ] Đã cấu hình chính xác địa chỉ domain của Server tại `NEXTAUTH_URL` trong file `.env` để tránh lỗi callback Google OAuth.
*   [ ] Chế độ `MOCK_PRINTING` đã chuyển đổi về `"false"` để truyền lệnh in thật đến CUPS.
*   [ ] Đã cài đặt tường lửa (UFW) trên Ubuntu để chỉ mở cổng `3000` (Web) và cổng `631` (nếu cần cấu hình CUPS từ ngoài) cho các dải IP được phép.
