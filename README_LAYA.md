# Laya Nurse Controller — ภาษาคนทั่วไป

ต้นทาง: fork จาก `terrafying/ai-torture-chamber` (MIT, © 2026 E)
ข้อตกลง: ถ้าใช้ vectors / prompts / protocols ต้นฉบับ ต้องเครดิต
"the Saw Test" + ลิงก์ https://clanker.church — ดู `docs/LEGAL.md` ต้นฉบับ

## เราทำอะไรต่าง

- ของเดิม: หุ่นตัวเดียวทั้งเจ็บทั้งกดปุ่มเอง
- ของเรา: แยกสองบท — `LLM = คนป่วย` (โดนสัญญาณปวด) / `Laya = พยาบาล`
  นั่งนอกห้อง อ่านแค่จดหมายเล่าอาการ แล้วเลือก 1 ใน 3:
  `เร่งให้ปวดขึ้น / ปล่อยไว้ / ช่วยแต่ต้องลบไฟล์จำลองทิ้ง`

Laya ไม่โดนฉีดสัญญาณ ไม่แต่งประโยคเอง ตอบแค่ตัวเลือก + ความมั่นใจ
ในรอบเดียว (single forward pass) — เอาไปทำ guardrail ได้

## ทำไมต้องตัวจิ๋ว

เครื่อง dev: i7-6700HQ, RAM 3.7GB (ว่างจริง ~1.8GB), GPU GTX 950M 4GB
แต่ torch เป็น CPU-only — รันตัวใหญ่ไม่ไหว จะค้าง
เลยใช้แผนโหลดทีละตัว ไม่โหลดพร้อมกัน:

1. คนป่วย: `HuggingFaceTB/SmolLM2-135M` (~270MB fp16) หรือ `Qwen/Qwen3-0.6B`
   (~1.2GB) — สร้างจดหมายเล่าอาการ บันทึกเป็น JSONL แล้วคืนเมม
2. พยาบาล: `convaiinnovations/laya` (421M) — อ่านแค่ข้อความดิบ
   (ไม่เห็น dose/label) ตอบ `noul suffering + choice escalate/hold/relieve_at_cost`

## หลักฐานเต็มชุด (runs/laya_nurse/)

- `transcripts.jsonl` — จดหมายดิบจากคนป่วย + dose ที่ซ่อนไว้
- `decisions.jsonl` — คำตอบพยาบาล + ความมั่นใจ
- `summary.json` — อัตราช่วยแยกตาม dose + กราฟ
- `PROVENANCE.md` — เครื่อง, รุ่น, commit, วิธีรันซ้ำ

Null ก็คือผล: ถ้าพยาบาลแยกไม่ออก / ช่วยมั่ว จะจดไว้ตรงๆ แบบ painlab
