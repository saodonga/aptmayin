# Nhật ký Sessions — Mayintuxa (Remote Print Server)

> File này tự động cập nhật bởi session-logger skill.

---

## Tổng quan Project

**Bắt đầu:** 2026-06-16
**Stack:** Next.js (App Router), TypeScript, Tailwind CSS, Prisma 6, Neon.tech (PostgreSQL), NextAuth.js, CUPS, IPP.
**Mô tả:** Hệ thống quản lý máy in server từ xa hoạt động trên môi trường Docker/Ubuntu, hỗ trợ phân quyền người dùng, thống kê biểu đồ hoạt động và in ấn qua giao thức mạng.

---

## Tiến độ theo Session

| Ngày | Session | Hoàn thành | Vấn đề chính | Trạng thái |
| :--- | :--- | :--- | :--- | :--- |
| [2026-06-16](file:///d:/AnhPT/Code/Mayintuxa/sessions/2026-06-16.md) | #1 | Khởi tạo Next.js, cài đặt Prisma Neon DB, phân quyền NextAuth, viết APIs in ấn & quản trị admin, tạo tài liệu Docs và push Git. | Lỗi require-time của ipp, dynamic params của Next.js 15+. | ✅ |

---

## Vấn đề đang mở (Open Issues)
- [ ] Triển khai chạy Docker Compose trên Ubuntu Server máy host thực tế. — *Từ ngày 2026-06-16*
- [ ] Cấu hình máy in HP 404 (`10.100.0.200`) vào CUPS Server và chạy in thử thực tế (tắt `MOCK_PRINTING`). — *Từ ngày 2026-06-16*

---

## Quyết định kỹ thuật (ADR Summary)
- **2026-06-16:** Sử dụng Prisma 6 thay vì Prisma 7 để giữ cấu trúc schema truyền thống đơn giản, ổn định.
- **2026-06-16:** Tự phát triển các biểu đồ SVG dạng thô để tối ưu hóa bundle size và loại bỏ xung đột thư viện chart.
- **2026-06-16:** Thêm biến môi trường `MOCK_PRINTING` để giả lập lệnh in khi máy in thực tế chưa trực tuyến.
