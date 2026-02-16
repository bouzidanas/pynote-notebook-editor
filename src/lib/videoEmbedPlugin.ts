/**
 * Video Embed Plugin for Milkdown
 * 
 * Renders <video> and <iframe class="video-embed"> as actual media elements
 * in the WYSIWYG editor instead of showing raw HTML text.
 * 
 * Also handles arrow-key navigation: pressing Down/Right at the end of a
 * document where a video is the last node inserts an empty paragraph below.
 */

import { $nodeSchema, $nodeAttr, $remark, $prose } from "@milkdown/kit/utils";
import { Plugin, PluginKey } from "@milkdown/kit/prose/state";
import type { MilkdownPlugin } from "@milkdown/kit/ctx";

// ─── Remark Plugin: Intercept video/iframe HTML in mdast ────────────────────

const VIDEO_RE = /^<video\s/i;
const IFRAME_VIDEO_RE = /^<iframe\s[^>]*class\s*=\s*"video-embed"/i;

export const remarkVideoEmbed = $remark(
    'remarkVideoEmbed',
    () => () => (tree: any) => {
        if (!tree.children) return;

        // Fast path: scan for any video HTML before allocating anything.
        // Most markdown cells have no video — this exits with zero allocations.
        let firstMatchIndex = -1;
        for (let i = 0; i < tree.children.length; i++) {
            const child = tree.children[i];
            if (isVideoHtml(child)
                || (child.type === 'paragraph'
                    && child.children?.length === 1
                    && isVideoHtml(child.children[0]))) {
                firstMatchIndex = i;
                break;
            }
        }
        if (firstMatchIndex === -1) return;

        // Only allocate when we know there's at least one match.
        // Copy preceding children as-is, then process from the match onward.
        const result: any[] = tree.children.slice(0, firstMatchIndex);

        for (let i = firstMatchIndex; i < tree.children.length; i++) {
            const child = tree.children[i];
            if (isVideoHtml(child)) {
                result.push({ type: 'video_embed', value: child.value });
                continue;
            }
            if (child.type === 'paragraph'
                && child.children?.length === 1
                && isVideoHtml(child.children[0])) {
                result.push({ type: 'video_embed', value: child.children[0].value });
                continue;
            }
            result.push(child);
        }

        tree.children = result;
    }
);

function isVideoHtml(node: any): boolean {
    if (node.type !== 'html' || typeof node.value !== 'string') return false;
    const val = node.value.trim();
    return VIDEO_RE.test(val) || IFRAME_VIDEO_RE.test(val);
}

// ─── Safe DOM rendering ─────────────────────────────────────────────────────

/** Parse an HTML string into a safe DOM element for video/iframe only. */
function createMediaElement(html: string): HTMLElement | null {
    const template = document.createElement('template');
    template.innerHTML = html.trim();
    const el = template.content.firstElementChild as HTMLElement | null;
    if (!el) return null;

    const tag = el.tagName.toLowerCase();
    if (tag === 'video') {
        const video = document.createElement('video');
        const src = el.getAttribute('src');
        if (src) video.setAttribute('src', src);
        if (el.hasAttribute('controls')) video.setAttribute('controls', '');
        if (el.hasAttribute('autoplay')) video.setAttribute('autoplay', '');
        if (el.hasAttribute('loop')) video.setAttribute('loop', '');
        if (el.hasAttribute('muted')) video.setAttribute('muted', '');
        const poster = el.getAttribute('poster');
        if (poster) video.setAttribute('poster', poster);
        return video;
    }
    if (tag === 'iframe' && el.classList.contains('video-embed')) {
        const iframe = document.createElement('iframe');
        const src = el.getAttribute('src');
        if (src && /^https:\/\/(www\.youtube\.com\/embed\/|player\.vimeo\.com\/video\/)/.test(src)) {
            iframe.setAttribute('src', src);
        }
        iframe.setAttribute('frameborder', '0');
        iframe.setAttribute('allowfullscreen', '');
        iframe.classList.add('video-embed');
        return iframe;
    }
    return null;
}

// ─── Node Attribute ─────────────────────────────────────────────────────────

export const videoEmbedAttr = $nodeAttr('video_embed');

// ─── Node Schema ────────────────────────────────────────────────────────────

export const videoEmbedSchema = $nodeSchema('video_embed', () => ({
    atom: true,
    group: 'block',
    selectable: true,
    draggable: true,
    attrs: {
        value: { default: '' },
    },
    // Simple toDOM for copy/paste and serialization fallback
    toDOM: (node) => {
        return ['div', {
            class: 'video-embed-wrapper',
            'data-value': node.attrs.value,
            contenteditable: 'false',
        }] as any;
    },
    parseDOM: [
        {
            tag: 'div.video-embed-wrapper',
            getAttrs: (dom: HTMLElement) => {
                return { value: dom.dataset.value ?? dom.getAttribute('data-value') ?? '' };
            },
        },
    ],
    parseMarkdown: {
        match: (node: any) => node.type === 'video_embed',
        runner: (state: any, node: any, type: any) => {
            state.addNode(type, { value: node.value as string });
        },
    },
    toMarkdown: {
        match: (node: any) => node.type.name === 'video_embed',
        runner: (state: any, node: any) => {
            state.addNode('html', undefined, node.attrs.value);
        },
    },
}));

// ─── NodeView Plugin ────────────────────────────────────────────────────────

const videoPluginKey = new PluginKey('videoEmbed');

export const videoEmbedPlugin = $prose(() => {
    return new Plugin({
        key: videoPluginKey,
        props: {
            nodeViews: {
                video_embed: (node) => {
                    const wrapper = document.createElement('div');
                    wrapper.classList.add('video-embed-wrapper');
                    wrapper.contentEditable = 'false';
                    wrapper.dataset.value = node.attrs.value;
                    const media = createMediaElement(node.attrs.value);
                    if (media) {
                        wrapper.appendChild(media);
                    }
                    return { dom: wrapper };
                },
            },
        },
    });
});

// ─── Plugin array for registration ──────────────────────────────────────────

export const videoEmbed: MilkdownPlugin[] = [
    remarkVideoEmbed,
    videoEmbedAttr,
    videoEmbedSchema,
    videoEmbedPlugin,
].flat() as any;
