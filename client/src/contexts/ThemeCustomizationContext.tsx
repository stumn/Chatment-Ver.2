import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

export type BackgroundStyle = 'solid' | 'gradient';
export type BackgroundIntensity = 'normal' | 'soft';
export type StripeStyle = 'none' | 'stripe';
export type ReactionIconStyle = 'smile' | 'none';

export interface ThemeCustomization {
  bgStyle: BackgroundStyle;
  bgIntensity: BackgroundIntensity;
  stripes: StripeStyle;
  reactionIcon: ReactionIconStyle;
}

export const DEFAULT_THEME_SETTINGS: ThemeCustomization = {
  bgStyle: 'solid',
  bgIntensity: 'normal',
  stripes: 'none',
  reactionIcon: 'smile',
};

const STORAGE_KEY = 'chatment-theme-customization';

interface ThemeCustomizationContextValue {
  themeSettings: ThemeCustomization;
  updateSetting: <K extends keyof ThemeCustomization>(
    key: K,
    value: ThemeCustomization[K]
  ) => void;
  resetToDefault: () => void;
}

const ThemeCustomizationContext = createContext<ThemeCustomizationContextValue | null>(null);

export const ThemeCustomizationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [themeSettings, setThemeSettings] = useState<ThemeCustomization>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        const icon = parsed.reactionIcon === 'none' ? 'none' : 'smile';
        return {
          bgStyle: parsed.bgStyle || DEFAULT_THEME_SETTINGS.bgStyle,
          bgIntensity: parsed.bgIntensity || DEFAULT_THEME_SETTINGS.bgIntensity,
          stripes: parsed.stripes || DEFAULT_THEME_SETTINGS.stripes,
          reactionIcon: icon,
        };
      }
    } catch (e) {
      console.warn('Failed to parse theme customization from localStorage', e);
    }
    return DEFAULT_THEME_SETTINGS;
  });

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(themeSettings));
    } catch (e) {
      console.warn('Failed to save theme customization to localStorage', e);
    }

    const root = document.documentElement;
    root.setAttribute('data-theme-bg-style', themeSettings.bgStyle);
    root.setAttribute('data-theme-bg-intensity', themeSettings.bgIntensity);
    root.setAttribute('data-theme-stripes', themeSettings.stripes);
    root.setAttribute('data-theme-reaction-icon', themeSettings.reactionIcon);
  }, [themeSettings]);

  const updateSetting = useCallback(
    <K extends keyof ThemeCustomization>(key: K, value: ThemeCustomization[K]) => {
      setThemeSettings(prev => ({
        ...prev,
        [key]: value,
      }));
    },
    []
  );

  const resetToDefault = useCallback(() => {
    setThemeSettings(DEFAULT_THEME_SETTINGS);
  }, []);

  return (
    <ThemeCustomizationContext.Provider
      value={{
        themeSettings,
        updateSetting,
        resetToDefault,
      }}
    >
      {children}
    </ThemeCustomizationContext.Provider>
  );
};

export function useThemeCustomization(): ThemeCustomizationContextValue {
  const context = useContext(ThemeCustomizationContext);
  if (!context) {
    throw new Error('useThemeCustomization must be used within a ThemeCustomizationProvider');
  }
  return context;
}
