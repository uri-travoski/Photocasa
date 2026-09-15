FROM lscr.io/linuxserver/webtop:ubuntu-openbox

LABEL maintainer="uri-travoski"
LABEL org.opencontainers.image.source="https://github.com/uri-travoski/Photocasa"
LABEL org.opencontainers.image.description="Photocasa - Modern offline photo library and editor in browser"

# Prevent interactive prompts during package installation
ENV DEBIAN_FRONTEND=noninteractive

# Install WebKitGTK, GTK3, and necessary GUI/graphics libraries
RUN apt-get update && apt-get install -y --no-install-recommends \
    libwebkit2gtk-4.1-0 \
    libsoup-3.0-0 \
    libjavascriptcoregtk-4.1-0 \
    adwaita-icon-theme-full \
    dbus-x11 \
    zenity \
    libgl1-mesa-dri \
    && rm -rf /var/lib/apt/lists/*

# Install Photocasa release binary
COPY src-tauri/target/release/app /usr/local/bin/photocasa
RUN chmod +x /usr/local/bin/photocasa

# Install application icons
COPY src-tauri/icons/128x128.png /usr/share/icons/hicolor/128x128/apps/photocasa.png
COPY src-tauri/icons/128x128@2x.png /usr/share/icons/hicolor/256x256/apps/photocasa.png

# Create desktop entry
RUN mkdir -p /usr/share/applications /defaults/Desktop && \
    printf "[Desktop Entry]\nName=Photocasa\nComment=Photo Library & Editor\nExec=/usr/local/bin/photocasa\nIcon=/usr/share/icons/hicolor/128x128/apps/photocasa.png\nTerminal=false\nType=Application\nCategories=Graphics;Photography;\nStartupWMClass=app\n" > /usr/share/applications/photocasa.desktop && \
    cp /usr/share/applications/photocasa.desktop /defaults/Desktop/photocasa.desktop && \
    chmod +x /defaults/Desktop/photocasa.desktop

# Configure autostart so Photocasa opens automatically when the browser connects
RUN printf '#!/usr/bin/env bash\n/usr/local/bin/photocasa &\nexit 0\n' > /defaults/autostart && \
    chmod +x /defaults/autostart

# Create default photos mount point
RUN mkdir -p /photos

# Expose web desktop ports (3000 HTTP, 3001 HTTPS)
EXPOSE 3000 3001

# Volumes for persistent settings/database and photo library
VOLUME ["/config", "/photos"]
