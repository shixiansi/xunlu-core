
<div
  id="container"
  style={{
    width: '100%',
    maxWidth: '1200px',
    margin: '0 auto',
    padding: '30px',
    borderRadius: '16px',
    backgroundImage: `url(${backgroundImageUrl})`,
    backgroundSize: 'cover',
    backgroundPosition: 'center',
    backgroundRepeat: 'no-repeat',
    boxSizing: 'border-box',
    fontFamily: '"Microsoft Yahei", "PingFang SC", sans-serif',
    backgroundColor:'white',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'space-between', 
  }}
>
  <div
    style={{
      textAlign: 'center',
      marginBottom: '40px',
      paddingBottom: '20px',
      borderBottom: '2px solid rgba(255, 255, 255, 0.6)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
    }}
  >
    <h1
      style={{
        color: '#fff',
        fontSize: '32px',
        textShadow: '0 3px 6px rgba(0, 0, 0, 0.4)',
        margin: 0,
        padding: 0,
        letterSpacing: '2px',
        fontWeight: '600',
      }}
    >
      千羽TTS语音模型角色库
    </h1>
    <p
      style={{
        color: 'rgba(255, 255, 255, 0.9)',
        fontSize: '16px',
        marginTop: '10px',
        marginBottom: 0,
        textShadow: '0 1px 3px rgba(0, 0, 0, 0.3)',
      }}
    >
      共 {ttsList.length} 个可用语音角色
    </p>
  </div>

  <div
    style={{
      display: 'flex',
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: '20px',
      justifyContent: 'flex-start',
      marginBottom: '40px',
      flex: 1,
      alignContent: 'flex-start',
      minHeight: 0,
    }}
  >
    {ttsList.map((tts, index) => (
      <div
        key={index}
        style={{
          borderRadius: '12px',
          boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)',
          display: 'flex',
          flexDirection: 'column',
          flex: '0 0 30%',
          maxWidth: '280px',
          backgroundColor: 'rgba(255, 255, 255, 0.85)',
          backdropFilter: 'blur(8px)',
          border: '1px solid rgba(255, 255, 255, 0.9)',
          transition: 'all 0.3s ease',
        }}
      >
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '0',
            padding: '20px',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'flex-start',
              padding: '0',
              background: 'transparent',
              borderRadius: '8px',
            }}
          >
            <div
              style={{
                width: '12px',
                height: '12px',
                borderRadius: '50%',
                backgroundColor: '#4CAF50',
                marginRight: '12px',
                flexShrink: 0,
              }}
            ></div>
            <div
              style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
              }}
            >
              <h4
                style={{
                  color: '#212121',
                  fontSize: '18px',
                  margin: 0,
                  fontWeight: '500',
                  lineHeight: '1.4',
                }}
              >
                {tts}
              </h4>
              <span
                style={{
                  color: '#666',
                  fontSize: '12px',
                  marginTop: '4px',
                }}
              >
                语音类型：{tts.includes('女声') ? '中文女声' : tts.includes('男声') ? '英文男声' : '特色语音'}
              </span>
            </div>
          </div>
        </div>
      </div>
    ))}
  </div>

  <div
    style={{
      textAlign: 'center',
      padding: '20px',
      background: 'rgba(255, 255, 255, 0.9)',
      borderRadius: '12px',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'center',
      boxShadow: '0 2px 8px rgba(0, 0, 0, 0.08)',
      backdropFilter: 'blur(8px)',
    }}
  >
    <h4
      style={{
        color: '#444',
        fontSize: '15px',
        fontWeight: 'normal',
        margin: 0,
        lineHeight: '1.8',
      }}
    >
      TTS角色状态说明{' '}
      <div
        style={{
          width: '12px',
          height: '12px',
          borderRadius: '50%',
          display: 'block',
          margin: '0 8px 0 4px',
          backgroundColor: '#4CAF50',
          verticalAlign: 'middle',
        }}
      ></div>
      表示角色可用{' '}
      <div
        style={{
          width: '12px',
          height: '12px',
          borderRadius: '50%',
          display: 'block',
          margin: '0 8px 0 4px',
          backgroundColor: '#FFC107',
          verticalAlign: 'middle',
        }}
      ></div>
      表示维护中{' '}
      <div
        style={{
          width: '12px',
          height: '12px',
          borderRadius: '50%',
          display: 'block',
          margin: '0 8px 0 4px',
          backgroundColor: '#F44336',
          verticalAlign: 'middle',
        }}
      ></div>
      表示角色不可用
    </h4>
    <p
      style={{
        color: '#777',
        fontSize: '12px',
        marginTop: '8px',
        marginBottom: 0,
      }}
    >
      最后更新时间：{new Date().toLocaleString()}
    </p>
  </div>
</div>