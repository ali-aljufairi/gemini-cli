/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { Colors } from '../colors.js';
import { themeManager, DEFAULT_THEME } from '../themes/theme-manager.js';
import { RadioButtonSelect } from './shared/RadioButtonSelect.js';
import { DiffRenderer } from './messages/DiffRenderer.js';
import { colorizeCode } from '../utils/CodeColorizer.js';
import { LoadedSettings, SettingScope } from '../../config/settings.js';
import { CustomTheme, createDefaultCustomTheme } from '../themes/theme.js';
import { CustomThemeEditor } from './CustomThemeEditor.js';

interface CustomThemeDialogProps {
    /** Callback function when a theme is selected */
    onSelect: (themeName: string | undefined, scope: SettingScope) => void;

    /** Callback function when a theme is highlighted */
    onHighlight: (themeName: string | undefined) => void;

    /** Callback function when a custom theme is saved */
    onCustomThemeSave?: (customTheme: CustomTheme, scope: SettingScope) => void;

    /** Callback function when a custom theme is deleted */
    onCustomThemeDelete?: (themeName: string, scope: SettingScope) => void;

    /** The settings object */
    settings: LoadedSettings;
    availableTerminalHeight?: number;
    terminalWidth: number;
}

export function CustomThemeDialog({
    onSelect,
    onHighlight,
    onCustomThemeSave,
    onCustomThemeDelete,
    settings,
    availableTerminalHeight,
    terminalWidth,
}: CustomThemeDialogProps): React.JSX.Element {
    const [selectedScope, setSelectedScope] = useState<SettingScope>(
        SettingScope.User,
    );
    const [showCustomThemeEditor, setShowCustomThemeEditor] = useState(false);
    const [editingTheme, setEditingTheme] = useState<CustomTheme | undefined>();
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [deleteThemeIndex, setDeleteThemeIndex] = useState<number | null>(null);

    // Generate theme items
    const availableThemes = themeManager.getAvailableThemes();
    const themeItems = availableThemes.map((theme, idx) => {
        const typeString = theme.type.charAt(0).toUpperCase() + theme.type.slice(1);
        const label = theme.isCustom ? `[Custom] ${theme.name}` : theme.name;
        return {
            label,
            value: idx,
            themeNameDisplay: theme.name,
            themeTypeDisplay: typeString,
            isCustom: theme.isCustom,
        };
    });

    // Add "Create Custom Theme" option
    const themeItemsWithCreate = [
        ...themeItems,
        {
            label: '[Create Custom Theme]',
            value: '__CREATE_CUSTOM__',
            themeNameDisplay: 'Create Custom Theme',
            themeTypeDisplay: 'Custom',
            isCustom: false,
        },
    ];

    const [selectInputKey, setSelectInputKey] = useState(Date.now());

    // Determine which radio button should be initially selected in the theme list
    const initialThemeIndex = themeItemsWithCreate.findIndex(
        (item) => item.themeNameDisplay === (settings.merged.theme || DEFAULT_THEME.name),
    );

    const scopeItems = [
        { label: 'User Settings', value: SettingScope.User },
        { label: 'Workspace Settings', value: SettingScope.Workspace },
    ];

    const handleThemeSelect = (idx: number) => {
        const themeName = availableThemes[idx].name;
        onSelect(themeName, selectedScope);
    };

    const handleScopeHighlight = (scope: SettingScope) => {
        setSelectedScope(scope);
        setSelectInputKey(Date.now());
    };

    const handleScopeSelect = (scope: SettingScope) => {
        handleScopeHighlight(scope);
        setFocusedSection('theme'); // Reset focus to theme section
    };

    const handleCustomThemeSave = (customTheme: CustomTheme, scope: SettingScope) => {
        if (onCustomThemeSave) {
            onCustomThemeSave(customTheme, scope);
        }
        setShowCustomThemeEditor(false);
        setEditingTheme(undefined);
        setSelectInputKey(Date.now()); // Refresh the theme list
    };

    const handleCustomThemeCancel = () => {
        setShowCustomThemeEditor(false);
        setEditingTheme(undefined);
    };

    // Focus state for navigation
    const [focusedSection, setFocusedSection] = useState<'theme' | 'create' | 'scope'>('theme');
    const [selectedThemeIndex, setSelectedThemeIndex] = useState(initialThemeIndex >= 0 ? initialThemeIndex : 0);

    // Navigation handler
    useInput((input, key) => {
        if (showCustomThemeEditor) return;
        if (showDeleteConfirm) {
            if (input === 'y' || input === 'Y') {
                if (deleteThemeIndex !== null) {
                    const themeToDelete = availableThemes[deleteThemeIndex];
                    if (themeToDelete.isCustom && onCustomThemeDelete) {
                        onCustomThemeDelete(themeToDelete.name, selectedScope);
                    }
                }
                setShowDeleteConfirm(false);
                setDeleteThemeIndex(null);
                return;
            }
            if (input === 'n' || input === 'N' || key.escape) {
                setShowDeleteConfirm(false);
                setDeleteThemeIndex(null);
                return;
            }
            return;
        }
        // j/k navigation
        if (input === 'j' || key.downArrow) {
            if (focusedSection === 'theme') {
                if (selectedThemeIndex < themeItems.length - 1) {
                    setSelectedThemeIndex(selectedThemeIndex + 1);
                } else {
                    setFocusedSection('create');
                }
            } else if (focusedSection === 'create') {
                setFocusedSection('scope');
            } else if (focusedSection === 'scope') {
                setFocusedSection('theme');
            }
            return;
        }
        if (input === 'k' || key.upArrow) {
            if (focusedSection === 'scope') {
                setFocusedSection('create');
            } else if (focusedSection === 'create') {
                setFocusedSection('theme');
                setSelectedThemeIndex(themeItems.length - 1);
            } else if (focusedSection === 'theme') {
                if (selectedThemeIndex > 0) {
                    setSelectedThemeIndex(selectedThemeIndex - 1);
                } else {
                    setFocusedSection('scope');
                }
            }
            return;
        }
        if (key.tab) {
            if (focusedSection === 'theme') {
                setFocusedSection('create');
            } else if (focusedSection === 'create') {
                setFocusedSection('scope');
            } else {
                setFocusedSection('theme');
            }
            return;
        }
        if (key.return) {
            if (focusedSection === 'theme') {
                handleThemeSelect(selectedThemeIndex);
            } else if (focusedSection === 'create') {
                // Pre-fill with a default custom theme based on the current theme type
                const currentTheme = themeManager.findThemeByName(settings.merged.theme) || DEFAULT_THEME;
                const defaultType = currentTheme.type === 'light' ? 'light' : 'dark';
                setEditingTheme(createDefaultCustomTheme('', defaultType));
                setShowCustomThemeEditor(true);
            } else if (focusedSection === 'scope') {
                // No-op for scope selection
            }
            return;
        }
        if (key.escape) {
            onSelect(undefined, selectedScope);
        }
        if (focusedSection === 'theme') {
            const selectedTheme = availableThemes[selectedThemeIndex];
            if (input === 'e' && selectedTheme.isCustom) {
                // Look up the full CustomTheme object from settings
                const customThemeObj = settings.merged.customThemes?.[selectedTheme.name];
                if (customThemeObj) {
                    setEditingTheme(customThemeObj);
                    setShowCustomThemeEditor(true);
                }
                return;
            }
            if (input === 'd' && selectedTheme.isCustom) {
                setShowDeleteConfirm(true);
                setDeleteThemeIndex(selectedThemeIndex);
                return;
            }
        }
    });

    let otherScopeModifiedMessage = '';
    const otherScope =
        selectedScope === SettingScope.User
            ? SettingScope.Workspace
            : SettingScope.User;
    if (settings.forScope(otherScope).settings.theme !== undefined) {
        otherScopeModifiedMessage =
            settings.forScope(selectedScope).settings.theme !== undefined
                ? `(Also modified in ${otherScope})`
                : `(Modified in ${otherScope})`;
    }

    // Constants for calculating preview pane layout.
    const PREVIEW_PANE_WIDTH_PERCENTAGE = 0.55;
    const PREVIEW_PANE_WIDTH_SAFETY_MARGIN = 0.9;
    const TOTAL_HORIZONTAL_PADDING = 4;
    const colorizeCodeWidth = Math.max(
        Math.floor(
            (terminalWidth - TOTAL_HORIZONTAL_PADDING) *
            PREVIEW_PANE_WIDTH_PERCENTAGE *
            PREVIEW_PANE_WIDTH_SAFETY_MARGIN,
        ),
        1,
    );

    const DAILOG_PADDING = 2;
    const selectThemeHeight = themeItemsWithCreate.length + 1;
    const SCOPE_SELECTION_HEIGHT = 4;
    const SPACE_BETWEEN_THEME_SELECTION_AND_APPLY_TO = 1;
    const TAB_TO_SELECT_HEIGHT = 2;
    availableTerminalHeight = availableTerminalHeight ?? Number.MAX_SAFE_INTEGER;
    availableTerminalHeight -= 2;
    availableTerminalHeight -= TAB_TO_SELECT_HEIGHT;

    let totalLeftHandSideHeight =
        DAILOG_PADDING +
        selectThemeHeight +
        SCOPE_SELECTION_HEIGHT +
        SPACE_BETWEEN_THEME_SELECTION_AND_APPLY_TO;

    let showScopeSelection = true;
    let includePadding = true;

    if (totalLeftHandSideHeight > availableTerminalHeight) {
        includePadding = false;
        totalLeftHandSideHeight -= DAILOG_PADDING;
    }

    if (totalLeftHandSideHeight > availableTerminalHeight) {
        totalLeftHandSideHeight -= SCOPE_SELECTION_HEIGHT;
        showScopeSelection = false;
    }

    const currenFocusedSection = !showScopeSelection ? 'theme' : focusedSection;

    const PREVIEW_PANE_FIXED_VERTICAL_SPACE = 8;

    availableTerminalHeight = Math.max(
        availableTerminalHeight,
        totalLeftHandSideHeight,
    );
    const availableTerminalHeightCodeBlock =
        availableTerminalHeight -
        PREVIEW_PANE_FIXED_VERTICAL_SPACE -
        (includePadding ? 2 : 0) * 2;
    const diffHeight = Math.floor(availableTerminalHeightCodeBlock / 2) - 1;
    const codeBlockHeight = Math.ceil(availableTerminalHeightCodeBlock / 2) + 1;

    let previewThemeName =
        focusedSection === 'theme' && availableThemes[selectedThemeIndex]
            ? availableThemes[selectedThemeIndex].name
            : settings.merged.theme || DEFAULT_THEME.name;

    // useEffect to handle preview theme switching and restoration
    React.useEffect(() => {
        const previousTheme = themeManager.getActiveTheme();
        const previewThemeObj = themeManager.findThemeByName(previewThemeName);
        if (previewThemeObj) {
            themeManager.setActiveTheme(previewThemeName);
        }
        return () => {
            if (previousTheme && previousTheme.name !== previewThemeName) {
                themeManager.setActiveTheme(previousTheme.name);
            }
        };
    }, [previewThemeName]);

    const selectedTheme = availableThemes[selectedThemeIndex];
    let themeInstructions = '';
    if (focusedSection === 'theme') {
        if (selectedTheme?.isCustom) {
            themeInstructions = 'Press e to edit, d to delete this custom theme.';
        } else {
            themeInstructions = 'Press Enter to select.';
        }
    } else if (focusedSection === 'create') {
        themeInstructions = 'Press Enter to create a new custom theme.';
    }

    if (showCustomThemeEditor) {
        return (
            <CustomThemeEditor
                onSave={handleCustomThemeSave}
                onCancel={handleCustomThemeCancel}
                settings={settings}
                existingTheme={editingTheme}
                terminalWidth={terminalWidth}
            />
        );
    }

    return (
        <Box
            borderStyle="round"
            borderColor={Colors.Gray}
            flexDirection="column"
            paddingTop={includePadding ? 1 : 0}
            paddingBottom={includePadding ? 1 : 0}
            paddingLeft={1}
            paddingRight={1}
            width="100%"
        >
            <Box flexDirection="row">
                {/* Left Column: Selection */}
                <Box flexDirection="column" width="45%" paddingRight={2}>
                    <Text bold={focusedSection === 'theme'} wrap="truncate">
                        {focusedSection === 'theme' ? '> ' : '  '}Select Theme{' '}
                        <Text color={Colors.Gray}>{otherScopeModifiedMessage}</Text>
                    </Text>
                    <RadioButtonSelect
                        items={themeItems}
                        initialIndex={selectedThemeIndex}
                        onSelect={handleThemeSelect}
                        onHighlight={(i: number) => setSelectedThemeIndex(i)}
                        isFocused={focusedSection === 'theme'}
                    />
                    {/* Create Custom Theme Button */}
                    <Box marginTop={1}>
                        <Text bold={focusedSection === 'create'} color={focusedSection === 'create' ? Colors.AccentBlue : undefined}>
                            {focusedSection === 'create' ? '> ' : '  '}[Create Custom Theme]
                        </Text>
                    </Box>
                    <Box marginTop={1}>
                        <Text color={Colors.Gray}>{themeInstructions}</Text>
                    </Box>
                    {/* Scope Selection */}
                    {showScopeSelection && (
                        <Box marginTop={1} flexDirection="column">
                            <Text bold={focusedSection === 'scope'} wrap="truncate">
                                {focusedSection === 'scope' ? '> ' : '  '}Apply To
                            </Text>
                            <RadioButtonSelect
                                items={scopeItems}
                                initialIndex={0}
                                onSelect={handleScopeSelect}
                                onHighlight={handleScopeHighlight}
                                isFocused={currenFocusedSection === 'scope'}
                            />
                        </Box>
                    )}
                </Box>

                {/* Right Column: Preview */}
                <Box flexDirection="column" width="55%" paddingLeft={2}>
                    <Text bold>Preview</Text>
                    <Box
                        borderStyle="single"
                        borderColor={Colors.Gray}
                        paddingTop={includePadding ? 1 : 0}
                        paddingBottom={includePadding ? 1 : 0}
                        paddingLeft={1}
                        paddingRight={1}
                        flexDirection="column"
                    >
                        {colorizeCode(
                            `# function\ndef fibonacci(n):\n    a, b = 0, 1\n    for _ in range(n):\n        a, b = b, a + b\n    return a`,
                            'python',
                            codeBlockHeight,
                            colorizeCodeWidth
                        )}
                        <Box marginTop={1} />
                        <DiffRenderer
                            diffContent={`--- a/old_file.txt\n+++ b/new_file.txt\n@@ -1,4 +1,5 @@\n This is a context line.\n-This line was deleted.\n+This line was added.\n`}
                            availableTerminalHeight={diffHeight}
                            terminalWidth={colorizeCodeWidth}
                        />
                    </Box>
                    {showDeleteConfirm && (
                        <Box marginTop={1}>
                            <Text color={Colors.AccentRed}>
                                Delete theme "{deleteThemeIndex !== null ? availableThemes[deleteThemeIndex].name : ''}"? (y/n)
                            </Text>
                        </Box>
                    )}
                </Box>
            </Box>
            <Box marginTop={1}>
                <Text color={Colors.Gray} wrap="truncate">
                    (Use Enter to select
                    {showScopeSelection ? ', Tab to change focus' : ''})
                </Text>
            </Box>
        </Box>
    );
} 