export default class AvatarRenderer {
    static renderToCanvas(avatarData, isLocked, isMonochrome, scale = 4) {
        if (avatarData.image_url) {
            const img = new Image();
            img.src = avatarData.image_url;
            img.className = 'avatar-img';
            // We return an image element instead of canvas if it's an image-based avatar
            return img;
        }

        const canvas = document.createElement('canvas');
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
                        // Canvas fillStyle does not support CSS variables directly
                        ctx.fillStyle = '#00ff41';
                    } else {
                        // Original color from palette
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
