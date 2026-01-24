// GitHub README加载器
(function() {
  'use strict';

  // 检查是否在古文字页面
  if (!window.githubRepos || window.githubRepos.length === 0) {
    return;
  }

  const readmeContainer = document.getElementById('github-readmes');
  if (!readmeContainer) {
    return;
  }

  // 配置marked选项
  if (typeof marked !== 'undefined') {
    marked.setOptions({
      breaks: true,
      gfm: true
    });
  }

  // 获取仓库基本信息（不包括README内容）
  async function fetchRepoInfo(owner, repo) {
    try {
      const repoResponse = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
        headers: {
          'Accept': 'application/vnd.github.v3+json'
        }
      });

      if (!repoResponse.ok) {
        throw new Error(`HTTP error! status: ${repoResponse.status}`);
      }

      const repoData = await repoResponse.json();
      const defaultBranch = repoData.default_branch || 'main';
      // 使用仓库创建日期或最后更新日期
      const dateStr = repoData.created_at || repoData.updated_at || new Date().toISOString();
      
      return {
        default_branch: defaultBranch,
        date: dateStr
      };
    } catch (error) {
      console.error(`Error fetching repo info for ${owner}/${repo}:`, error);
      return null;
    }
  }

  // 获取GitHub README（仅在点击时调用）
  async function fetchGitHubReadme(owner, repo) {
    try {
      const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/readme`, {
        headers: {
          'Accept': 'application/vnd.github.v3+json'
        }
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      
      // 获取仓库的默认分支
      const repoResponse = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
        headers: {
          'Accept': 'application/vnd.github.v3+json'
        }
      });
      const repoData = repoResponse.ok ? await repoResponse.json() : { default_branch: 'main' };
      const defaultBranch = repoData.default_branch || 'main';
      
      // 解码base64内容，正确处理UTF-8编码
      const base64Content = data.content.replace(/\s/g, '');
      const binaryString = atob(base64Content);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      // 使用TextDecoder解码UTF-8
      let content = new TextDecoder('utf-8').decode(bytes);
      
      // 将相对路径的图片链接转换为GitHub raw链接
      // 匹配Markdown图片语法: ![alt](path) 或 ![alt](./path)
      const rawBaseUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${defaultBranch}`;
      content = content.replace(/!\[([^\]]*)\]\((?!https?:\/\/)([^)]+)\)/g, (match, alt, path) => {
        // 移除开头的 ./ 或 ../
        let cleanPath = path.replace(/^\.\//, '').replace(/^\.\.\//, '');
        // 如果路径不是以http开头，转换为GitHub raw链接
        if (!path.startsWith('http://') && !path.startsWith('https://')) {
          return `![${alt}](${rawBaseUrl}/${cleanPath})`;
        }
        return match;
      });
      
      return {
        content: content,
        html_url: data.html_url,
        name: data.name,
        default_branch: defaultBranch
      };
    } catch (error) {
      console.error(`Error fetching README for ${owner}/${repo}:`, error);
      return null;
    }
  }

  // 格式化日期
  function formatDate(dateStr) {
    if (!dateStr) return '-';
    // 如果已经是 YYYY-MM-DD 格式，直接返回
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      return dateStr;
    }
    // 否则尝试解析
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return dateStr; // 如果解析失败，返回原字符串
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  // 渲染README列表项（只显示标题和日期，不包含README内容）
  function renderReadmeListItem(repoConfig, index) {
    const title = repoConfig.name || repoConfig.repo;
    const formattedDate = repoConfig.date ? formatDate(repoConfig.date) : '-';
    // 构建跳转URL（使用绝对路径，Jekyll的pretty permalink会处理为/readme-viewer/）
    const readmeUrl = `/readme-viewer/?owner=${encodeURIComponent(repoConfig.owner)}&repo=${encodeURIComponent(repoConfig.repo)}&title=${encodeURIComponent(title)}`;

    return `
      <div class="readme-item">
        <div class="readme-item-header">
          <h2 class="readme-item-title">
            <a href="${readmeUrl}">
              ${title}
            </a>
          </h2>
          <span class="readme-item-date">${formattedDate}</span>
        </div>
      </div>
    `;
  }

  // 渲染README内容
  function renderReadmeContent(repoConfig, readmeData) {
    // 渲染Markdown为HTML
    let htmlContent = '';
    if (typeof marked !== 'undefined') {
      htmlContent = marked.parse(readmeData.content);
    } else {
      // 如果没有marked库，使用简单的文本显示
      htmlContent = `<pre>${readmeData.content}</pre>`;
    }

    // 创建临时容器来处理HTML中的图片链接
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = htmlContent;
    
    // 修复HTML中所有img标签的src属性（处理已渲染的HTML中的相对路径）
    const images = tempDiv.querySelectorAll('img');
    const rawBaseUrl = `https://raw.githubusercontent.com/${repoConfig.owner}/${repoConfig.repo}/${readmeData.default_branch || 'main'}`;
    images.forEach(img => {
      const src = img.getAttribute('src');
      if (src && !src.startsWith('http://') && !src.startsWith('https://')) {
        // 相对路径，转换为GitHub raw链接
        const cleanPath = src.replace(/^\.\//, '').replace(/^\.\.\//, '');
        img.setAttribute('src', `${rawBaseUrl}/${cleanPath}`);
      }
    });
    
    return tempDiv.innerHTML;
  }

  // 立即加载推文列表（使用配置中的固定日期，无需API调用）
  function loadReadmeList() {
    // 立即渲染推文列表（使用配置中的日期）
    readmeContainer.innerHTML = window.githubRepos
      .map((repoConfig, index) => renderReadmeListItem(repoConfig, index))
      .join('');
  }


  // 页面加载完成后执行
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', loadReadmeList);
  } else {
    loadReadmeList();
  }
})();




