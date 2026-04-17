# CLAUDE.md — debut.show 프로젝트 컨텍스트

> Claude Code가 이 파일을 읽으면 전체 프로젝트를 즉시 이해하고 작업할 수 있다.
> 매 세션 시작 시 이 파일을 먼저 읽을 것.

---

## 1. 프로젝트 정체성

**debut.show** — 바이브코딩(AI 보조 개발) 프로젝트 전용 런치패드 + 인증 플랫폼.

```
한 줄 정의: 바이브코딩 앱을 데뷔시키는 커뮤니티 리그 —
           3주 시즌제 · AI 객관 분석 · 졸업 인증 시스템
```

- **레포**: https://github.com/hans1329/vibe
- **Supabase URL**: https://tekemubwihsjdzittoqf.supabase.co
- **배포 대상**: Cloudflare Pages
- **도메인**: debut.show (예정)
- **미국 런칭**, 법인 기설립 완료
- **참조 문서**: `supabase/schema.sql`, `PRD v1.0` (별도 보관)

---

## 2. 핵심 설계 원칙 (변경 불가)

이 원칙들은 v8.1까지 법적 검토를 거친 확정 결정사항이다. 임의 변경 금지.

```
- 단일 회원제: 모든 사용자는 Member. 역할은 행위 레이블(Creator/Scout/Forecaster/Applauder)
- 유료 회원제 없음: 전원 무료 가입. 수익 = 등록비·마켓 수수료·스폰서십
- "Forecast" 용어 사용: Predict·Bet·Wager 금지 (CFTC·도박법 리스크)
- "리그 진척률" 용어: Bonding Curve 언급 금지 (Pump.fun 연상)
- "Betting" 금지: 항상 "prediction", "join", "growth band" 사용
- 심사 룰북 공개: 중립 리그 포지션 유지의 핵심 증거
- 자동 분석 50% + 커뮤니티 평가 50%: 어느 한쪽만으로 졸업 불가
```

---

## 3. 기술 스택 (확정)

```
Frontend:   React 18 + Vite + TypeScript + Tailwind CSS
Backend:    Supabase (PostgreSQL + Auth + Edge Functions + Realtime)
AI 분석:    Claude API (claude-sonnet-4-5) — 점수 산출 + 인사이트
Lighthouse: Google PageSpeed Insights API (무료 키 or VITE_PAGESPEED_KEY)
GitHub 분석: GitHub REST API (공개 레포 파싱)
배포:       Cloudflare Pages (무료 · 무제한 빌드)
결제:       Stripe (등록비 $99) — V0.5에서 추가
```

### 환경변수 (.env)

```
VITE_SUPABASE_URL=https://tekemubwihsjdzittoqf.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
VITE_PAGESPEED_KEY=  # 선택사항
```

### 아키텍처 원칙

```
- Supabase Cron → Edge Function → DB 상태머신 → React 읽기
- 함수가 함수를 호출하는 패턴 금지 (동시 실행 한계)
- pipeline_health 뷰를 첫 번째로 구현 (관찰 가능성 우선)
- API 안전: while(true) 금지 · offset DB 저장 · 일일 한도 상수 하드코딩
```

---

## 4. 디자인 시스템 (아이비리그 스쿨)

```
테마:     네이비 + 골드. 학교·리그·졸업 메타포.
배경:     --navy-950: #060C1A (최어둠)
표면:     --navy-800: #0F2040
골드:     --gold-500: #F0C040 (메인 액센트)
크림:     --cream: #F8F5EE (텍스트)
스칼렛:   --scarlet: #C8102E (경고·수석)

폰트:
  Display: Playfair Display (헤드라인 · 점수 · 등급)
  Body:    DM Sans (본문)
  Mono:    DM Mono (레이블 · 코드 · 태그)

절대 금지:
  - Inter, Roboto, Arial (제네릭 폰트)
  - 보라색 그라디언트 on 흰 배경 (AI 슬롭 패턴)
  - 둥근 버튼 (border-radius: 2px 유지)
```

---

## 5. 현재 파일 구조

```
vibe/
├── src/
│   ├── components/
│   │   ├── Nav.tsx          # 네비게이션 (스크롤 시 배경 등장)
│   │   ├── Hero.tsx         # 히어로 (gold shimmer 타이포)
│   │   ├── SubmitForm.tsx   # 4단계 제출폼 + 분석 + 결과카드
│   │   └── ProjectFeed.tsx  # Supabase 실시간 피드
│   ├── lib/
│   │   ├── supabase.ts      # DB 클라이언트 + Project 타입
│   │   └── analysis.ts      # PageSpeed + GitHub + Claude 파이프라인
│   ├── App.tsx              # 전체 페이지 레이아웃
│   └── index.css            # 디자인 토큰 + 전역 스타일
├── supabase/
│   └── schema.sql           # DB 스키마 + RLS 정책 (Supabase에 실행 필요)
├── public/
│   ├── _redirects           # Cloudflare Pages SPA 라우팅
│   └── favicon.svg
├── CLAUDE.md                # 이 파일
├── .env                     # 로컬 환경변수 (gitignore됨)
├── .env.example             # 환경변수 템플릿
└── package.json
```

---

## 6. 점수 체계 (100점)

```
자동 분석 (50%):
  - Lighthouse Performance: 90+=10, 70-89=7, 50-69=4, <50=0
  - Lighthouse Accessibility: 90+=8, 70-89=5, <70=2
  - Lighthouse Best Practices: 90+=8, 70-89=5, <70=1
  - Lighthouse SEO: 90+=4, 70-89=2
  - GitHub accessible: +5
  - Tech layer diversity: +최대 5
  - Build Brief 완성도: +3
  - Live URL 정상: +5

Scout Forecast (30%):
  - Platinum 박수: ×3.0
  - Gold 박수: ×2.0
  - Silver 박수: ×1.5
  - Bronze 박수: ×1.0

커뮤니티 (20%):
  - 조회수 · 댓글 깊이 · 공유 · 재방문율 (품질 가중)

졸업 조건 (AND):
  - 종합 75점 이상
  - 자동분석 35/50 이상
  - Scout 최소 3명 이상
  - 75점 2주 유지
  - Live URL 헬스체크 통과
```

---

## 7. 졸업 등급 & 혜택

```
수석 졸업 (≈0.5%, 1명 고정):
  환급 100% + $500 보너스
  명예의 전당 영구 등재 · 미디어 10,000 노출 보장
  홈 1주 피처드 · 특별 NFT

우등 졸업 (상위 5%, 수석 제외):
  환급 85%
  명예의 전당 · 인증 배지 · 피처드 · NFT

일반 졸업 (상위 20% 중 우등 제외):
  환급 70%
  졸업 배지 · Build Brief 전체 공개

낙제 (하위 80%):
  환급 0%
  AI 분석 리포트 · Brief 비공개 선택 · 재도전 가능
```

---

## 8. Creator 그레이드

```
Rookie        → 등록 1개+, 졸업 0
Builder       → 졸업 1개, 평균 60+
Maker         → 졸업 2개, 평균 70+
Architect     → 졸업 3개, 평균 75+, 기술 다양성
Vibe Engineer → 졸업 5개, 박수 20+, 평균 80+
Legend        → 졸업 10개+, 커뮤니티 영향력
```

---

## 9. Scout 티어 (Activity Point 기반)

```
Bronze   → 0~499 AP   · 월 20 votes · 박수 ×1.0
Silver   → 500~1999   · 월 40 votes · 박수 ×1.5 · 보안분석 12h 선공개
Gold     → 2000~4999  · 월 60 votes · 박수 ×2.0 · 보안분석 24h 선공개
Platinum → 5000+      · 월 80 votes · 박수 ×3.0 · 전체 분석 선공개
```

---

## 10. 분석 언락 트리 (Vote 누적)

```
등록 즉시  → GitHub 구조 · Lighthouse 4지표 · MD 무결성 · Live URL
Vote 1~3  → 코드 품질 스냅샷 (복잡도 · 중복 패턴)
Vote 5    → 보안 레이어 (RLS · 환경변수 · API 인증) — Silver+ 선공개
Vote 10   → 프로덕션 레디 체크 (CWV · 취약점) — 졸업 필수 조건
Vote 20   → Scout 심층 코멘트 인터페이스 (Platinum+)
```

---

## 11. 3주 시즌 구조

```
Week 1 (Day 1-7):   수치 숨김 · 단계 라벨만 · 분석 언락 시작
Week 2 (Day 8-14):  상대값 공개 ("상위 X%") · 피드백 1차 전달
Week 3 (Day 15-21): 구체 수치 · 6h 지연 스냅샷 · Vote 집중
Day 22-28:          Applaud Week (장인상 투표 · 30초 사용 인증 필수)
Day 29:             졸업식 · 환급 · 배지 지급 · Alumni Brief 오픈
```

---

## 12. Build Brief 구조

```
Phase 1 (시즌 중 공개):
  - 해결하는 문제
  - 핵심 기능 1~3가지
  - 사용한 AI 도구
  - 타겟 유저

Phase 2 (졸업 후 공개 — v2 구조화 프롬프트):
  ① Stack Fingerprint: RUNTIME/FRONTEND/BACKEND/DB/INFRA/AI_LAYER 형식 강제
  ② Failure Log: AI가 3회+ 틀린 순간 2가지 (증상·원인·해결·재발방지)
  ③ Decision Archaeology: "A 대신 B 선택" 2가지
  ④ AI Delegation Map: 영역별 AI vs 본인 비중 (6개 영역 이상)
  ⑤ Live Proof: 배포 URL · GitHub · API · 컨트랙트 주소
  ⑥ Next Blocker: 다음 장벽 + AI에게 시킬 첫 번째 작업
```

---

## 13. DB 핵심 테이블

```sql
projects     -- 앱 등록 · 점수 · 분석 결과 · 상태
votes        -- Scout Forecast 투표
applauds     -- 장인상 박수 (30초 사용 인증 필수)
seasons      -- 시즌 메타
hall_of_fame -- 졸업 프로젝트 영구 아카이브
members      -- 회원 (티어 · AP · 그레이드)
```

전체 스키마: `supabase/schema.sql` 참조

---

## 14. 수익 구조

```
검증됨:
  - 등록비 $99 (낙제 시 보유 · 졸업 등급별 환급 차감분)
  - 수석 상금 $500/시즌 (Skill Contest 프레임)

미검증 (V1.5+):
  - Sponsored Slot (기업 홈 노출)
  - Season Partner (AI툴사 스폰서십)
  - MD 마켓플레이스 수수료 15~20%
  - 구인 마켓 수수료 10~15%
```

---

## 15. 연계 마켓플레이스 (V1.5)

```
MD 마켓플레이스:
  카테고리: Scaffold · Prompt Library · MCP Config ·
           Project Rules · Backend · Auth/Payment · Playbooks
  조건: 졸업 크리에이터 MD = "프로덕션 검증" 배지
  수수료: 15~20%

구인 마켓:
  졸업 배지 = "프로덕션 레디 검증" 필터
  수수료: 계약 성사 10~15%
```

---

## 16. 개발 로드맵

```
V0 (현재):
  ✅ 랜딩 페이지 (Ivy League 디자인)
  ✅ 프로젝트 제출 4단계 폼
  ✅ PageSpeed + GitHub + Claude 분석 파이프라인
  ✅ 점수 카드 + 언락 트리 시각화
  ✅ Supabase 프로젝트 피드
  ✅ Cloudflare Pages 배포 설정

V0.5 (다음):
  ☐ Supabase Auth (이메일 + Google)
  ☐ Scout 티어 시스템 + Activity Point
  ☐ Vote (Forecast) UI + 언락 실시간 트리거
  ☐ Stripe $99 결제 + 환급 로직
  ☐ Progress Bar 3주 시즌 구조

V1:
  ☐ 3주 시즌 엔진 (Supabase Cron)
  ☐ Applaud Week + 장인상
  ☐ Community Recognition Award
  ☐ 명예의 전당 (SSR via Cloudflare Worker)
  ☐ 심사 룰북 공개 페이지

V1.5:
  ☐ MD 마켓플레이스
  ☐ 구인 마켓
  ☐ Season Partner 연동
```

---

## 17. 법적 주의사항 (Phase 2 확인 필요)

```
- Community Award 프레이밍: AB5 · 1099 분류 — Counsel 확인 전까지 working theory
- 수석 상금 $500: BPC §17539.1 공시 요건 확인 필요
- "Discretionary" 문언 vs 자동 규칙 기반 지급 정합성
- $99 등록비 Competition Entry Fee 구조 적법성
→ 서비스 오픈 전 외부 Counsel 확인 필수
```

---

## 18. 어뷰징 방어 규칙

```
- 댓글: 월 50개 상한
- Share: 일 3회 상한
- AI Analysis 수락: 월 100개 상한
- 코사인 유사도 0.85+ → Phase 2 자동 트리거
- 동일 IP 복수 계정 Forecast → 자동 플래그
- 자기 프로젝트 Applaud → 블록 + Scout 신뢰도 영구 차감
- 과장 탐지 (서술 vs GitHub 실제 불일치) → 해당 섹션 0점
```

---

## 19. Claude Code 작업 가이드

### 코드 작성 시 반드시 지킬 것

```
1. 디자인 토큰은 index.css CSS 변수만 사용 (하드코딩 금지)
2. 폰트는 Playfair Display / DM Sans / DM Mono만 사용
3. border-radius: 2px 기본 (둥근 버튼 금지)
4. Supabase 쿼리는 항상 error 처리 포함
5. 분석 API 실패 시 fallback 값 반드시 제공
6. 컴포넌트는 src/components/ 에만 생성
7. 비즈니스 로직은 src/lib/ 에만 작성
8. 환경변수는 반드시 import.meta.env.VITE_* 형식
```

### 자주 쓰는 커맨드

```bash
npm run dev          # 개발 서버
npm run build        # 프로덕션 빌드
npm run preview      # 빌드 미리보기
git add . && git commit -m "..." && git push origin main
```

### Supabase 테이블 업데이트 시

```
1. supabase/schema.sql 수정
2. Supabase 대시보드 → SQL Editor에서 실행
3. src/lib/supabase.ts의 타입 업데이트
```

---

## 20. 현재 즉시 해야 할 것

```
Priority 1: Supabase에 schema.sql 실행 (테이블 생성)
Priority 2: Cloudflare Pages 연결 + 환경변수 설정
Priority 3: npm install + npm run dev로 로컬 확인
Priority 4: V0.5 — Stripe $99 결제 연동
```

---

*이 파일은 프로젝트가 진행될수록 업데이트한다.*
*마지막 업데이트: 2026-04-18 · debut.show PRD v1.0 기반*
