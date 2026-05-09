export const IntroCutscene = [
    {
        id: '01',
        title: 'VOID_AWAKENING',
        duration: 3000,
        type: 'cinematic_text',
        content: '...',
        bgEffect: 'stardust',
        description: 'Void with subtle stardust particles'
    },
    {
        id: '02',
        title: 'PULSE_SIGNAL',
        duration: 3000,
        type: 'pulse_dither',
        content: 'INITIALIZING',
        description: 'Dithering signal pulse awakening'
    },
    {
        id: '03',
        title: 'TITLE_COLLAPSE',
        duration: 5000,
        type: 'title_active',
        main: 'NO MEMORY',
        sub: "I don't remember.",
        effect: 'vortex_decay',
        description: 'Dynamic title with vortex particle decay'
    },
    {
        id: '04',
        title: 'SPAWNED_ACTION',
        duration: 4000,
        type: 'growth_active',
        state: 'baby',
        content: 'SPAWNED',
        bgEffect: 'grid_warp',
        description: 'Active baby motion with warping grid'
    },
    {
        id: '05',
        title: 'GROWTH_RUSH',
        duration: 4000,
        type: 'growth_active',
        state: 'kid',
        content: 'GROWTH DETECTED',
        bgEffect: 'speed_lines',
        description: 'Fast transformation crawl to run'
    },
    {
        id: '06',
        title: 'TIMELINE_STORM',
        duration: 7000,
        type: 'timeline_action',
        startYear: 1974,
        endYear: 1980,
        effect: 'camera_shake',
        description: 'Action run through years with camera shake'
    },
    {
        id: '07',
        title: 'MEMORY_ORBIT',
        duration: 4000,
        type: 'orbit_cinematic',
        words: ['HOME', 'MOTHER', 'STREET', 'FRIEND', 'SCHOOL'],
        bgEffect: 'dither_fade',
        description: 'Cinematic memory orbit'
    },
    {
        id: '08',
        title: 'SYSTEM_ENTRY',
        duration: 3000,
        type: 'location_action',
        content: 'ENTERING SYSTEM',
        location: 'NATIONAL SCHOOL',
        effect: 'zoom_in',
        description: 'Dynamic school entry with zoom'
    },
    {
        id: '09',
        title: 'SIGNAL_ALERT',
        duration: 3000,
        type: 'alert_glitch',
        content: 'UNKNOWN SIGNAL DETECTED',
        sub: '???',
        effect: 'red_glitch',
        description: 'Glitch alert with far neon glow'
    },
    {
        id: '10',
        title: 'ARCADE_EXPLOSION',
        duration: 6000,
        type: 'arcade_cinematic',
        content: 'INSERT COIN',
        hasColor: true,
        effect: 'neon_burst',
        description: 'Arcade reveal with cinematic neon explosion'
    },
    {
        id: '11',
        title: 'FINAL_REVEAL',
        duration: 5000,
        type: 'title_cinematic',
        main: 'NO MEMORY',
        sub: 'But I remember this.',
        description: 'Final title and auto transition'
    }
];
