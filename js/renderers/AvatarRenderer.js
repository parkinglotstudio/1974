export default class AvatarRenderer {
    static renderToCanvas(avatarData, isLocked, isMonochrome, scale = 4, frameIdx = 0) {
        if (avatarData.image_url) {
            const img = new Image();
            img.src = avatarData.image_url;
            img.className = 'avatar-img';
            return img;
        }

        const canvas = document.createElement('canvas');

        // New logic: Support for external pixel data (coordinate based)
        const pixelData = avatarData.pixel_data || (avatarData.visual ? avatarData.visual.pixel_data : null);

        if (pixelData) {
            const data = pixelData;
            const palette = data.palette || [];
            
            canvas.width  = (data.width || 128) * scale;
            canvas.height = (data.height || 128) * scale;

            const ctx = canvas.getContext('2d');
            ctx.imageSmoothingEnabled = false;

            // 1. Check for pixel_map (dense grid) first
            const currentFrame = data.frames && data.frames[frameIdx] ? data.frames[frameIdx] : (data.frames ? data.frames[0] : data);
            const pixelMap = currentFrame.pixel_map || data.pixel_map;

            if (pixelMap) {
                for (let y = 0; y < pixelMap.length; y++) {
                    for (let x = 0; x < pixelMap[y].length; x++) {
                        const val = pixelMap[y][x];
                        if (val === 0 || val === null) continue; // Skip empty
                        
                        if (isLocked) ctx.fillStyle = '#222222';
                        else if (isMonochrome) ctx.fillStyle = '#00ff41';
                        else ctx.fillStyle = (typeof val === 'number') ? (palette[val] || '#ffffff') : val;

                        if (ctx.fillStyle === 'transparent') continue;
                        ctx.fillRect(x * scale, y * scale, scale, scale);
                    }
                }
            } else {
                // 2. Fallback to coordinate-based pixels list
                const pixels = currentFrame.pixels || [];
                for (const [x, y, colorOrIdx] of pixels) {
                    if (isLocked) ctx.fillStyle = '#222222';
                    else if (isMonochrome) ctx.fillStyle = '#00ff41';
                    else {
                        ctx.fillStyle = (typeof colorOrIdx === 'number') ? (palette[colorOrIdx] || '#ffffff') : colorOrIdx;
                    }

                    if (ctx.fillStyle === 'transparent') continue;
                    ctx.fillRect(x * scale, y * scale, scale, scale);
                }
            }
            return canvas;
        }

        // Old logic: Legacy pixel map
        if(!avatarData || !avatarData.pixel_map) return canvas;

        const map = avatarData.pixel_map;
        const height = map.length;
        const width = map[0].length;

        canvas.width = width * scale;
        canvas.height = height * scale;
        const ctx = canvas.getContext('2d');
        ctx.imageSmoothingEnabled = false;

        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const colorIndex = map[y][x];
                if (colorIndex !== 0) {
                    if (isLocked) {
                        ctx.fillStyle = '#222222'; // Silhouette
                    } else if (isMonochrome) {
                        ctx.fillStyle = '#00ff41';
                    } else {
                        let colorStr = avatarData.palette[colorIndex];
                        if(colorStr === 'transparent') continue;
                        ctx.fillStyle = colorStr || '#ffffff';
                    }
                    ctx.fillRect(x * scale, y * scale, scale, scale);
                }
            }
        }
        return canvas;

    }
}
