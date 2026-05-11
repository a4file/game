import { STORY_BEAT_COUNT, STORY_SEQUENCE_COUNT } from "../../rpg/story/beatsNormalize";

export const StoryNarrativeHelp = () => (
  <details className="story-narrative-help">
    <summary className="story-narrative-help-summary" title="100씬·12비트·8시퀀스 가이드 (터치로 펼침)">
      도움말 · 프레임워크
    </summary>
    <div className="story-narrative-help-body">
      <p>
        <strong>12비트</strong>는 감정·전환 단위, <strong>8시퀀스</strong>는 목표·플롯 단위입니다. 겹쳐 설계합니다.
      </p>
      <ul>
        <li>권장: 1시퀀스 ≈ 12~13씬, 총 100씬 전후.</li>
        <li>비트는 “사건”이 아니라 <strong>감정 상태 변화</strong>(예: 탐색→공포)로 잡으면 살아납니다.</li>
        <li>
          <strong>6비트(미드포인트)</strong>와 <strong>8비트(완전 붕괴)</strong>가 약하면 전체가 평평해집니다.
        </li>
        <li>씬 4항목(목표·충돌·변화·감정비트)만 채워도 장편이 무너지지 않습니다.</li>
        <li>주요 씬 35~45 + 연결/호흡 씬 55~65 정도의 밸런스를 권장합니다.</li>
      </ul>
      <p className="story-narrative-help-meta">
        이 패널은 모바일에서도 <strong>요약 줄을 탭</strong>해 펼칠 수 있습니다. 데스크톱에서는 항목에 마우스를 올려 툴팁을 확인하세요.
      </p>
      <p className="story-narrative-help-meta">
        고정: 비트 {STORY_BEAT_COUNT}개, 시퀀스 슬롯 {STORY_SEQUENCE_COUNT}개.
      </p>
    </div>
  </details>
);
