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
            // Use specific frame if frames exist
            const pixels = data.pixels || (data.frames && data.frames[frameIdx] ? data.frames[frameIdx].pixels : (data.frames ? data.frames[0].pixels : []));
            
            canvas.width  = (data.width || 128) * scale;
            canvas.height = (data.height || 128) * scale;

            const ctx = canvas.getContext('2d');
            ctx.imageSmoothingEnabled = false;

            for (const [x, y, color] of pixels) {
                if (isLocked) {
                    ctx.fillStyle = '#222222';
                } else if (isMonochrome) {
                    ctx.fillStyle = '#00ff41';
                } else {
                    ctx.fillStyle = color;
                }
                ctx.fillRect(x * scale, y * scale, scale, scale);
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
