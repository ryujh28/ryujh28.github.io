# 📚 간단한 Publication Update Guide

## 🎯 핵심 개념
- **기본**: 모든 논문은 깔끔한 텍스트만 표시
- **선택적**: 특정 논문만 저널 커버 이미지 추가 가능

## 📝 새 논문 추가하기

### 1. publications_list.txt 업데이트
```
# New publication 1
Author1, Author2, Ryu, J. H. (YEAR). Paper Title. Journal Name.
https://doi.org/10.xxxx/xxxx

# New publication 2
...
```

### 2. 저널 커버 추가 (선택사항)
원하는 논문만 `covers/` 폴더에 저널 커버 추가:

| 저널 | 파일명 |
|------|--------|
| Journal of Chemical Information and Modeling | `JCIM.png` ✅ |
| Science Advances | `science_advances_cover.jpg` |
| Journal of Molecular Liquids | `molecular_liquids_cover.jpg` |
| Small | `small_cover.jpg` |
| The Journal of Physical Chemistry C | `jpcc_cover.jpg` |
| arXiv preprint | `arxiv_cover.jpg` |

### 3. 웹사이트 업데이트
```bash
python3 flexible_publications_updater.py
```

## 📁 현재 파일 구조
```
ryujh28.github.io/
├── index.html                          # 메인 웹사이트
├── publications_list.txt               # 논문 목록
├── flexible_publications_updater.py    # 업데이트 스크립트
├── covers/                             # 저널 커버 (선택사항)
│   └── JCIM.png                        # 현재 유일한 커버
└── HOW_TO_UPDATE.md                    # 이 파일
```

## ✨ 작동 방식

### 📄 커버 없는 논문 (기본)
- 깔끔한 텍스트 레이아웃
- 논문 제목, 저널명, 링크만 표시

### 🖼️ 커버 있는 논문
- 왼쪽에 저널 커버 이미지
- 오른쪽에 논문 정보
- Flex 레이아웃 사용

## 🚀 사용 예시

**현재 상태:**
- JCIM 논문 → 커버 이미지와 함께 표시 🖼️
- arXiv 논문 → 텍스트만 깔끔하게 표시 📄

**새 논문 추가시:**
1. `publications_list.txt`에 논문 정보 추가
2. 원한다면 `covers/` 폴더에 저널 커버 추가
3. `python3 flexible_publications_updater.py` 실행
4. 커버가 있으면 이미지와 함께, 없으면 텍스트만 표시됨

## 💡 관리 팁
- 모든 논문에 커버를 추가할 필요 없음
- 중요한 저널이나 특별한 논문만 선택적으로 커버 추가
- 파일명은 정확히 맞춰야 함 (대소문자 구분)
- 이미지는 .jpg 또는 .png 형식