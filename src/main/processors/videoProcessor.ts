import ffmpeg from 'fluent-ffmpeg';
import ffmpegPath from 'ffmpeg-static';
import ffprobePath from 'ffprobe-static';

if (ffmpegPath) ffmpeg.setFfmpegPath(ffmpegPath);
if (ffprobePath) ffmpeg.setFfprobePath(ffprobePath.path);

export async function processVideo(inputPath: string, outputPath: string) {
  return new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      .outputOptions([
        '-map_metadata -1', // 移除全局元数据
        '-map_chapters -1', // 移除章节信息
        '-metadata encoder=', // 显式清空编码器信息
        '-fflags +bitexact',  // 启用位精确模式，减少额外标记
        '-flags:v +bitexact', // 视频流位精确
        '-flags:a +bitexact', // 音频流位精确
        '-c copy',           // 流拷贝，不重新编码，极快
      ])
      .on('end', () => {
        resolve({
          removed: ['全局元数据 (Title/Artist/Creation Time)', '流元数据', '章节信息', '硬件/编码器信息'],
          type: 'video',
        });
      })
      .on('error', (err) => {
        reject(err);
      })
      .save(outputPath);
  });
}
