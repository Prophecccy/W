import Jimp from "jimp";

async function generate() {
  try {
    const iconPath = "src-tauri/icons/icon.png";
    
    // Sidebar: 164x314
    // We'll create a dark background canvas, and place the logo in the center (scaled down)
    const sidebar = new Jimp(164, 314, 0x121212FF);
    const logoSource1 = await Jimp.read(iconPath);
    logoSource1.contain(120, 120); // scale logo to fit inside 120x120 preserving aspect ratio
    sidebar.composite(logoSource1, (164-120)/2, (314-120)/2); // Center it
    await sidebar.writeAsync("src-tauri/icons/sidebar.bmp");
    console.log("Generated sidebar.bmp");

    // Header: 150x57
    // Background: #E63946 (our brand red) or dark? Windows installer header is usually white or gray,
    // actually let's make it #121212FF (dark) and place the logo on the right side.
    const header = new Jimp(150, 57, 0x121212FF);
    const logoSource2 = await Jimp.read(iconPath);
    logoSource2.contain(45, 45); // scale logo to fit inside 45x45
    // Add it to the right corner, centered vertically
    header.composite(logoSource2, 150 - 45 - 6, (57 - 45) / 2);
    await header.writeAsync("src-tauri/icons/header.bmp");
    console.log("Generated header.bmp");
    
  } catch (err) {
    console.error("Failed to generate NSIS images:", err);
  }
}

generate();
