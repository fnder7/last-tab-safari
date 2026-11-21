// Site icons for the strip, kept in memory by URL. A failed load just leaves the letter.
import AppKit

@MainActor
final class FaviconCache {
    private var images: [URL: NSImage] = [:]
    private var loading: Set<URL> = []

    /// The icon if it is already loaded; otherwise starts loading and calls `loaded` once it is.
    func image(for url: URL?, loaded: @escaping () -> Void) -> NSImage? {
        guard let url else { return nil }
        if let image = images[url] { return image }
        guard !loading.contains(url) else { return nil }
        loading.insert(url)
        Task { [weak self] in
            let data = try? await URLSession.shared.data(from: url).0
            guard let self else { return }
            self.loading.remove(url)
            if let data, let image = NSImage(data: data) {
                self.images[url] = image
                loaded()
            }
        }
        return nil
    }
}
