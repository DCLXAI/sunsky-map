import { useEditorStore } from "./store";

type Language = 'en' | 'ko';

const translations: Record<string, Record<Language, string>> = {
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
    "Follow": { en: "Follow", ko: "팔로우" },
    "Top": { en: "Top", ko: "탑뷰" },
    "Side": { en: "Side", ko: "사이드" },
    "World": { en: "World", ko: "월드" },

    // Toast Messages
    "Project saved successfully!": { en: "Project saved successfully!", ko: "프로젝트가 저장되었습니다!" },
    "Failed to save project.": { en: "Failed to save project.", ko: "저장에 실패했습니다." },
    "Export finished! Downloading video...": { en: "Export finished! Downloading video...", ko: "내보내기 완료! 다운로드 중..." },
    "Recording started... Please wait for animation to finish.": { en: "Recording started... Please wait for animation to finish.", ko: "녹화 시작... 애니메이션이 끝날 때까지 기다려주세요." },
    "Map is not ready yet.": { en: "Map is not ready yet.", ko: "지도가 아직 준비되지 않았습니다." },
    "Export finished! Downloading MP4...": { en: "Export finished! Downloading MP4...", ko: "MP4 다운로드 중..." },
    "Export finished! Saved as WebM (MP4 not supported).": { en: "Export finished! Saved as WebM (MP4 not supported).", ko: "WebM으로 저장됨 (브라우저가 MP4 미지원)." },
    "No supported video format found in this browser.": { en: "No supported video format found in this browser.", ko: "이 브라우저에서는 지원되는 비디오 형식을 찾을 수 없습니다." },
};

export const useTranslation = () => {
    const { language } = useEditorStore();

    const t = (key: string): string => {
        const entry = translations[key];
        if (!entry) return key; // Fallback to key if missing
        return entry[language] || key;
    };

    return { t, language };
};
