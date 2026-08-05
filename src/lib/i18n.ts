import { useCallback } from "react";
import { useEditorStore } from "./store";

type Language = 'en' | 'ko';

export const translations: Record<string, Record<Language, string>> = {
    // Top Bar
    "Save": { en: "Save", ko: "저장" },
    "Preview": { en: "Preview", ko: "미리보기" },
    "Stop": { en: "Stop", ko: "정지" },
    "Export Video": { en: "Export Video", ko: "영상 내보내기" },
    "Recording...": { en: "Recording...", ko: "녹화 중..." },

    // Floating Panel
    "Waypoints": { en: "Waypoints", ko: "경유지" },
    "Search cities...": { en: "Search cities...", ko: "도시 검색..." },
    "Add Place": { en: "Add Place", ko: "장소 추가" },
    "Project Settings": { en: "Project Settings", ko: "프로젝트 설정" },
    "Map Style": { en: "Map Style", ko: "지도 스타일" },
    "Camera View": { en: "Camera View", ko: "카메라 시점" },

    // Camera Modes
    "Chase": { en: "Chase", ko: "팔로우" },
    "Follow": { en: "Follow", ko: "팔로우" },
    "Map": { en: "Map", ko: "지도" },
    "Top": { en: "Top", ko: "탑뷰" },
    "Side": { en: "Side", ko: "사이드" },
    "World": { en: "World", ko: "월드" },

    // Toast Messages
    "Project saved successfully!": { en: "Project saved successfully!", ko: "프로젝트가 저장되었습니다!" },
    "Failed to save project.": { en: "Failed to save project.", ko: "저장에 실패했습니다." },
    "Failed to load project.": { en: "Failed to load project.", ko: "프로젝트를 불러오지 못했습니다." },
    "Failed to capture map stream. Try again.": { en: "Failed to capture map stream. Try again.", ko: "지도 화면 캡처에 실패했습니다. 다시 시도해주세요." },
    "Recording failed. Please try a different browser.": { en: "Recording failed. Please try a different browser.", ko: "녹화에 실패했습니다. 다른 브라우저를 사용해보세요." },
    "Export finished! Downloading video...": { en: "Export finished! Downloading video...", ko: "내보내기 완료! 다운로드 중..." },
    "Recording started... Please wait for animation to finish.": { en: "Recording started... Please wait for animation to finish.", ko: "녹화 시작... 애니메이션이 끝날 때까지 기다려주세요." },
    "Map is not ready yet.": { en: "Map is not ready yet.", ko: "지도가 아직 준비되지 않았습니다." },
    "Export finished! Downloading MP4...": { en: "Export finished! Downloading MP4...", ko: "MP4 다운로드 중..." },
    "Export finished! Saved as WebM (MP4 not supported).": { en: "Export finished! Saved as WebM (MP4 not supported).", ko: "WebM으로 저장됨 (브라우저가 MP4 미지원)." },
    "No supported video format found in this browser.": { en: "No supported video format found in this browser.", ko: "이 브라우저에서는 지원되는 비디오 형식을 찾을 수 없습니다." },

    // AI Assistant
    "AI Route Assistant": { en: "AI Route Assistant", ko: "AI 경로 도우미" },
    "Generate Route": { en: "Generate Route", ko: "경로 생성" },
    "Generating Magic...": { en: "Generating Magic...", ko: "생성 중..." },
    "Generating route with Gemini...": { en: "Generating route with Gemini...", ko: "Gemini로 경로 생성 중..." },
    "Route generated successfully!": { en: "Route generated successfully!", ko: "경로가 생성되었습니다!" },
    "Failed to generate route. Please try again.": { en: "Failed to generate route. Please try again.", ko: "경로 생성에 실패했습니다. 다시 시도해주세요." },
    "Error generating route": { en: "Error generating route", ko: "경로 생성 중 오류가 발생했습니다" },
    "e.g. I want to travel from Seoul to Tokyo, then fly to Paris and finish in New York. (Press Enter)": {
        en: "e.g. I want to travel from Seoul to Tokyo, then fly to Paris and finish in New York. (Press Enter)",
        ko: "예: 서울에서 도쿄로 갔다가 파리를 거쳐 뉴욕에서 마무리하고 싶어요. (Enter를 누르세요)",
    },

    // Waypoint list
    "Trip Title...": { en: "Trip Title...", ko: "여행 제목..." },
    "City Name": { en: "City Name", ko: "도시 이름" },
    "Change Emoji": { en: "Change Emoji", ko: "이모지 변경" },
    "Start your journey by searching for a city above.": {
        en: "Start your journey by searching for a city above.",
        ko: "위에서 도시를 검색해 여행을 시작해보세요.",
    },
    "Plane": { en: "Plane", ko: "비행기" },
    "Car": { en: "Car", ko: "자동차" },
    "Train": { en: "Train", ko: "기차" },
    "Walk": { en: "Walk", ko: "도보" },
    "Sat": { en: "Sat", ko: "위성" },
    "Dark": { en: "Dark", ko: "다크" },
    "Light": { en: "Light", ko: "라이트" },

    // Accessible names for icon-only controls
    "Toggle AI route assistant": { en: "Toggle AI route assistant", ko: "AI 경로 도우미 열고 닫기" },
    "Toggle the editing panel": { en: "Toggle the editing panel", ko: "편집 패널 열고 닫기" },
    "Switch language": { en: "Switch language", ko: "언어 전환" },
    "Reorder this stop": { en: "Reorder this stop", ko: "이 경유지 순서 변경" },
    "Remove this stop": { en: "Remove this stop", ko: "이 경유지 삭제" },

    // Landing page
    "3D Travel Animation": { en: "3D Travel Animation", ko: "3D 여행 애니메이션" },
    "Create cinematic travel route animations in seconds.": {
        en: "Create cinematic travel route animations in seconds.",
        ko: "몇 초 만에 시네마틱한 여행 경로 애니메이션을 만들어보세요.",
    },
    "Export high-quality videos for your content.": {
        en: "Export high-quality videos for your content.",
        ko: "고화질 영상으로 내보내 콘텐츠에 활용하세요.",
    },
    "Create Map Animation": { en: "Create Map Animation", ko: "지도 애니메이션 만들기" },
    "Powered by Mapbox GL 3D": { en: "Powered by Mapbox GL 3D", ko: "Mapbox GL 3D 기반" },
    "Your Previous Trips": { en: "Your Previous Trips", ko: "이전 여행" },
    "Projects": { en: "Projects", ko: "개" },
    "Untitled Trip": { en: "Untitled Trip", ko: "제목 없는 여행" },
    "Last updated:": { en: "Last updated:", ko: "마지막 수정:" },
    "Open Editor": { en: "Open Editor", ko: "편집기 열기" },
    "Delete Project?": { en: "Delete Project?", ko: "프로젝트를 삭제할까요?" },
    "This action cannot be undone. This will permanently delete your travel route animation.": {
        en: "This action cannot be undone. This will permanently delete your travel route animation.",
        ko: "되돌릴 수 없습니다. 이 여행 경로 애니메이션이 영구적으로 삭제됩니다.",
    },
    "Cancel": { en: "Cancel", ko: "취소" },
    "Delete": { en: "Delete", ko: "삭제" },
    "Delete project": { en: "Delete project", ko: "프로젝트 삭제" },
    "Error creating project": { en: "Error creating project", ko: "프로젝트 생성에 실패했습니다" },
    "Failed to delete project": { en: "Failed to delete project", ko: "프로젝트 삭제에 실패했습니다" },
    "Terms": { en: "Terms", ko: "이용약관" },
    "Privacy": { en: "Privacy", ko: "개인정보" },
    "Contact": { en: "Contact", ko: "문의" },
};

export const useTranslation = () => {
    // Subscribe to just `language` so unrelated store updates don't re-render consumers.
    const language = useEditorStore((state) => state.language);

    // Stable across renders for a given language, so `t` is safe in effect deps.
    const t = useCallback(
        (key: string): string => {
            const entry = translations[key];
            if (!entry) return key; // Fallback to key if missing
            return entry[language] || key;
        },
        [language]
    );

    return { t, language };
};
