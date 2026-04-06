from PIL import Image

# RGB values for #121212
BG_COLOR = (18, 18, 18)

try:
    # 1. Load our icon
    icon = Image.open('src-tauri/icons/icon.png').convert("RGBA")
    
    # --- Sidebar: 164x314 ---
    sidebar = Image.new('RGB', (164, 314), BG_COLOR)
    # Resize the icon to ~120x120 preserving aspect
    icon_sidebar = icon.copy()
    icon_sidebar.thumbnail((120, 120))
    
    # Calculate position to center
    x = (164 - icon_sidebar.width) // 2
    y = (314 - icon_sidebar.height) // 2
    
    # Paste using the icon's alpha channel as mask
    sidebar.paste(icon_sidebar, (x, y), icon_sidebar)
    sidebar.save('src-tauri/icons/sidebar.bmp', format='BMP')
    print("sidebar.bmp generated!")
    
    # --- Header: 150x57 ---
    # According to NSIS standard, it goes at the top right of the dialogue.
    # The header image is placed over the white/default header color unless customized.
    # We will make it same dark color to fit the app or keep it transparent? BMP doesn't support alpha in standard NSIS.
    # But usually the NSIS header has a standard white background, let's use white for the header
    # or just keep it dark if we customize the NSIS colors? 
    # Actually, default NSIS window header is white. Let's make the header background white.
    # Wait! The user's screen shows the header is WHITE in the NSIS window. 
    # So we should use (255,255,255) for the header BG.
    header = Image.new('RGB', (150, 57), (255, 255, 255))
    icon_header = icon.copy()
    icon_header.thumbnail((45, 45))
    
    # Center vertically, align to right side (e.g., 5px margin)
    x = 150 - icon_header.width - 6
    y = (57 - icon_header.height) // 2
    
    header.paste(icon_header, (x, y), icon_header)
    header.save('src-tauri/icons/header.bmp', format='BMP')
    print("header.bmp generated!")

except Exception as e:
    print(f"Error: {e}")
