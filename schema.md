datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

generator client {
  provider = "prisma-client-js"
}

enum Role {
  DANISAN
  UZMAN
  ADMIN
}

enum ApprovalStatus {
  TASLAK
  ONAY_BEKLIYOR
  YAYINDA
  REDDEDILDI
  REVIZE_GONDERILDI
}

enum ContactSubject {
  SORU_SORUN
  RANDEVU_OLUSTURUN
  ONERI
  SIKAYET
  DIGER
}

enum SssPage {
  GENEL
  TESTLER
  PAKETLER
}

enum NotificationType {
  INFO
  WARNING
  DANGER_PANIC // Uzman panelinde kıpkırmızı yanıp sönecek panik uyarısı
}

enum QuestionStatus {
  ONAY_BEKLIYOR
  ATANDI
  CEVAPLANDI
}

enum RequestStatus {
  BEKLEMEDE
  UZMANA_YONLENDIRILDI
  TAMAMLANDI
}

model User {
  id            String    @id @default(uuid())
  firstName     String
  lastName      String
  email         String    @unique
  phone         String
  passwordHash  String
  role          Role      @default(DANISAN)
  isActive      Boolean   @default(true)
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt

  // İlişkiler
  expertProfile  ExpertProfile?
  favorites      Favorite[]
  testResults    TestResult[]
  comments       Comment[]
  tokens         RefreshToken[]
  forumQuestions ForumQuestion[] // Danışanın sorduğu sorular
  expertRequests ExpertRequest[] // Danışanın profil üzerinden gönderdiği talepler

  @@map("users")
}

model RefreshToken {
  id        String   @id @default(uuid())
  token     String   @unique
  userId    String
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  expiresAt DateTime
  createdAt DateTime @default(now())

  @@map("refresh_tokens")
}

model ExpertProfile {
  id             String         @id @default(uuid())
  userId         String         @unique
  user           User           @relation(fields: [userId], references: [id], onDelete: Cascade)
  
  title          String         // Örn: Uzman Klinik Psikolog
  avatarUrl      String
  bio            String         // Backend DTO validation: 80-150 kelime kısıtlaması
  education      String         @db.Text // Yeni Eklenen: Profilde doğrudan okunacak yazılı eğitim/özgeçmiş bilgisi
  certificateUrl String         // Zorunlu Sertifika PDF
  cvUrl          String         // Zorunlu CV PDF
  priorityScore  Int            @default(1) // 1-100 arası öncelik skoru
  rating         Float          @default(5.0) // Onaylı yorumlardan beslenen ortalama yıldız
  status         ApprovalStatus @default(TASLAK)
  adminNote      String?        // Red durumunda zorunlu girilen açıklama

  createdAt      DateTime       @default(now())
  updatedAt      DateTime       @updatedAt

  // İlişkiler
  tags           Tag[]          // Yeni Limit: Min 2, Max 12-15 adet etiket
  blogs          Blog[]
  availabilities Availability[]
  favorites      Favorite[]
  forumQuestions ForumQuestion[] // Uzmana atanan forum soruları
  expertRequests ExpertRequest[] // Bu uzmana yönlendirilen talepler

  @@map("expert_profiles")
}

model Tag {
  id        String          @id @default(uuid())
  name      String          @unique
  isActive  Boolean         @default(true)
  profiles  ExpertProfile[]

  @@map("tags")
}

model Availability {
  id              String        @id @default(uuid())
  expertProfileId String
  expertProfile   ExpertProfile @relation(fields: [expertProfileId], references: [id], onDelete: Cascade)
  dayOfWeek       Int           // 0-6 (Pazar-Cumartesi)
  startTime       String        // "09:00"
  endTime         String        // "10:00"
  isBlockedByAdmin Boolean      @default(false)

  @@map("availabilities")
}

model Favorite {
  id              String        @id @default(uuid())
  userId          String
  user            User          @relation(fields: [userId], references: [id], onDelete: Cascade)
  expertProfileId String
  expertProfile   ExpertProfile @relation(fields: [expertProfileId], references: [id], onDelete: Cascade)
  createdAt       DateTime      @default(now())

  @@unique([userId, expertProfileId])
  @@map("favorites")
}

// YENİ MODÜL: "Uzman Cevaplıyor" (Forum) Tabloları
model ForumQuestion {
  id              String         @id @default(uuid())
  userId          String         // Soruyu soran danışan
  user            User           @relation(fields: [userId], references: [id], onDelete: Cascade)
  expertProfileId String?        // Adminin soruyu atadığı uzman (Opsiyonel - İlk başta null)
  expertProfile   ExpertProfile? @relation(fields: [expertProfileId], references: [id], onDelete: SetNull)
  
  title           String
  content         String         @db.Text
  status          QuestionStatus @default(ONAY_BEKLIYOR)
  createdAt       DateTime       @default(now())
  updatedAt       DateTime       @updatedAt
  
  answers         ForumAnswer[]

  @@map("forum_questions")
}

model ForumAnswer {
  id              String        @id @default(uuid())
  questionId      String
  question        ForumQuestion @relation(fields: [questionId], references: [id], onDelete: Cascade)
  expertProfileId String        // Cevaplayan uzman
  expertProfile   ExpertProfile @relation(fields: [expertProfileId], references: [id], onDelete: Cascade)
  
  content         String        @db.Text
  isApproved      Boolean       @default(false) // Admin onay mekanizması forum cevapları için de geçerli
  createdAt       DateTime      @default(now())

  @@map("forum_answers")
}

// REVIZE EDİLEN MODÜL: Danışan Talepleri (Admine düşen, uzman statüsü gösteren yapı)
model ExpertRequest {
  id              String        @id @default(uuid())
  userId          String
  user            User          @relation(fields: [userId], references: [id], onDelete: Cascade)
  expertProfileId String        // Danışanın talep ettiği uzman
  expertProfile   ExpertProfile @relation(fields: [expertProfileId], references: [id], onDelete: Cascade)
  
  message         String        @db.Text
  status          RequestStatus @default(BEKLEMEDE) // Beklemede, Uzmana Yönlendirildi, Tamamlandı
  createdAt       DateTime      @default(now())

  @@map("expert_requests")
}

model Test {
  id          String       @id @default(uuid())
  title       String
  slug        String       @unique
  description String
  isActive    Boolean      @default(true)
  results     TestResult[]

  @@map("tests")
}

model TestResult {
  id        String   @id @default(uuid())
  userId    String
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  testId    String
  test      Test     @relation(fields: [testId], references: [id], onDelete: Cascade)
  scoreSummary String 
  createdAt DateTime @default(now())

  @@map("test_results")
}

model Blog {
  id              String         @id @default(uuid())
  expertProfileId String
  expertProfile   ExpertProfile  @relation(fields: [expertProfileId], references: [id], onDelete: Cascade)
  title           String
  slug            String         @unique
  content         String         @db.Text
  status          ApprovalStatus @default(TASLAK)
  adminNote       String?        

  createdAt       DateTime       @default(now())
  updatedAt       DateTime       @updatedAt

  @@map("blogs")
}

model Comment {
  id              String   @id @default(uuid())
  userId          String
  user            User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  expertProfileId String
  expertProfile   ExpertProfile @relation(fields: [expertProfileId], references: [id], onDelete: Cascade)
  content         String
  rating          Int      
  isApproved      Boolean  @default(false)
  createdAt       DateTime @default(now())

  @@map("comments")
}

model Package {
  id          String   @id @default(uuid())
  name        String   
  sessionCount Int     
  price       Decimal  @db.Decimal(10, 2) 
  description String
  updatedAt   DateTime @updatedAt

  @@map("packages")
}

model ContactForm {
  id          String         @id @default(uuid())
  fullName    String
  email       String
  phone       String
  subject     ContactSubject
  message     String
  isCorporate Boolean        @default(false) 
  companyName String?        
  employeeCount String?      
  createdAt   DateTime       @default(now())

  @@map("contact_forms")
}

model Newsletter {
  id        String   @id @default(uuid())
  email     String   @unique
  createdAt DateTime @default(now())

  @@map("newsletters")
}

// REVIZE EDİLEN MODEL: Sayfa bazlı SSS kategorisi
model Sss {
  id        String   @id @default(uuid())
  question  String
  answer    String   @db.Text
  page      SssPage  @default(GENEL) // Hangi sayfada gösterileceği (GENEL, TESTLER, PAKETLER)
  isActive  Boolean  @default(true)
  order     Int      @default(0)

  @@map("sss")
}

// REVIZE EDİLEN MODEL: Uzman Uyarıları için Panik Tipi ve Sistem Genel Ayarları
model Notification {
  id        String           @id @default(uuid())
  userId    String           // Bildirimin gideceği uzman veya admin
  type      NotificationType @default(INFO) // INFO, WARNING, DANGER_PANIC
  message   String
  isRead    Boolean          @default(false)
  createdAt DateTime         @default(now())

  @@map("notifications")
}

model SystemSetting {
  id              String @id @default(uuid())
  whatsappNumber  String 
  instagramUrl    String // Sadece Instagram ve WhatsApp kalacağı için diğer sosyal medyaları şemadan eledim
  
  // Yeni Eklenen Alanlar: Kartların üzerinde duracak merkezi standart ve indirimli fiyat politikası
  standardPrice   Decimal @db.Decimal(10, 2) @default(1500.00) // Örn: 1500
  discountedPrice Decimal @db.Decimal(10, 2) @default(1000.00) // Örn: 1000
  
  logoUrl         String
  videoUrl        String? // Biz Kimiz sekmesi için yüklenecek stüdyo video linki (YouTube/Vimeo/S3)
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  @@map("system_settings")
}